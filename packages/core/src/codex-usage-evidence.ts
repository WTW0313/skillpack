import {
  parse,
  type BlockStatement,
  type CallExpression,
  type Expression,
  type ModuleDeclaration,
  type Pattern,
  type Program,
  type Statement,
} from 'acorn';
import os from 'node:os';
import path from 'node:path';

export type CodexSkillReadStatus = 'loaded' | 'used' | 'failed' | 'unknown';

export type CodexEvidenceFindingReason =
  | 'analysis-budget-exceeded'
  | 'invalid-javascript'
  | 'unresolved-command'
  | 'unresolved-workdir';

export interface CodexEvidenceFinding {
  lineIndex: number;
  reason: CodexEvidenceFindingReason;
  count: number;
}

export interface CodexSkillReadEvidence {
  callId: string;
  lineIndex: number;
  sessionId: string;
  turnId: string;
  skillPath: string;
  status: CodexSkillReadStatus;
  startedAt: string;
  endedAt?: string;
}

export interface CodexUsageEvidenceResult {
  reads: CodexSkillReadEvidence[];
  findings: CodexEvidenceFinding[];
}

interface ExecCommand {
  cmd: string;
  workdir?: string;
  workdirUnresolved?: boolean;
}

interface ExecCommandResolution {
  command?: ExecCommand;
  reason?: CodexEvidenceFindingReason;
  potentialSkillEvidence: boolean;
}

interface ExecCandidate extends ExecCommand {
  callId: string;
  format: 'legacy' | 'orchestrated';
  lineIndex: number;
  sessionId: string;
  turnId: string;
  contextCwd?: string;
  startedAt: string;
  statusHint?: CodexSkillReadStatus;
}

interface OutputEvidence {
  endedAt?: string;
  output?: string;
}

interface StaticObject {
  kind: 'object';
  properties: Map<string, StaticEvaluation>;
}

interface StaticArray {
  kind: 'array';
  items: StaticValue[];
}

interface StaticFunction {
  kind: 'function';
  params: Pattern[];
  body: BlockStatement | Expression;
  environment: StaticEnvironment;
  localName?: string;
}

interface StaticOpaqueObject {
  kind: 'opaque-object';
}

interface StaticOpaqueLeaf {
  kind: 'opaque-leaf';
}

type StaticValue = string | StaticObject | StaticArray | StaticFunction | StaticOpaqueObject | StaticOpaqueLeaf;
const UNRESOLVED = Symbol('unresolved');
const UNINITIALIZED = Symbol('uninitialized');
const STATIC_OPAQUE_OBJECT: StaticOpaqueObject = { kind: 'opaque-object' };
const STATIC_OPAQUE_LEAF: StaticOpaqueLeaf = { kind: 'opaque-leaf' };
type StaticEvaluation = StaticValue | typeof UNRESOLVED;
type StaticBinding = StaticEvaluation | typeof UNINITIALIZED;
type StaticEnvironment = Map<string, StaticBinding>;
const ARRAY_MUTATOR_METHODS = new Set([
  'copyWithin',
  'fill',
  'pop',
  'push',
  'reverse',
  'shift',
  'sort',
  'splice',
  'unshift',
]);
const CODEX_ORCHESTRATION_HELPERS = new Set([
  'generatedImage',
  'image',
  'load',
  'notify',
  'store',
  'text',
  'yield_control',
]);
const MAX_PROGRAM_SOURCE_LENGTH = 1_000_000;
const MAX_STATIC_EVALUATION_STEPS = 10_000;
const MAX_STATIC_ITERATIONS = 10_000;
const MAX_STATIC_COMMANDS = 256;
const MAX_STATIC_EVALUATION_DEPTH = 100;
const MAX_STATIC_STRING_LENGTH = 1_000_000;
const MAX_STATIC_STRING_CODE_UNITS = 10_000_000;
const MAX_SKILL_PATHS_PER_COMMAND = 256;
const UNSUPPORTED_RUNTIME_EXPRESSIONS = new Set([
  'BinaryExpression',
  'ChainExpression',
  'ClassExpression',
  'ConditionalExpression',
  'ImportExpression',
  'LogicalExpression',
  'NewExpression',
  'SequenceExpression',
  'TaggedTemplateExpression',
  'UnaryExpression',
  'YieldExpression',
]);

interface EvaluationContext {
  budgetExceeded: boolean;
  commands: ExecCommand[];
  commandCount: number;
  evaluationDepth: number;
  evaluationSteps: number;
  findings: CodexEvidenceFinding[];
  iterations: number;
  lineIndex: number;
  pathUnsupported: boolean;
  source: string;
  staticStringCodeUnits: number;
}

type ExecutionCompletion =
  | { kind: 'normal' }
  | { kind: 'return'; value: StaticEvaluation }
  | { kind: 'break' }
  | { kind: 'continue' }
  | { kind: 'unsupported' };

export function deriveCodexUsageEvidence(input: {
  sourceFile: string;
  lines: readonly string[];
}): CodexUsageEvidenceResult {
  const candidates: ExecCandidate[] = [];
  const outputs = new Map<string, OutputEvidence>();
  const findings: CodexEvidenceFinding[] = [];
  let sessionId = path.basename(input.sourceFile, '.jsonl');
  let turnId = sessionId;
  let cwd: string | undefined;

  for (const [lineIndex, line] of input.lines.entries()) {
    const event = parseJsonRecord(line);
    if (!event) continue;
    const payload = isRecord(event.payload) ? event.payload : {};

    if (event.type === 'session_meta') {
      sessionId = stringValue(payload.session_id) ?? stringValue(payload.id) ?? sessionId;
      turnId = sessionId;
      cwd = stringValue(payload.cwd) ?? cwd;
      continue;
    }
    if (event.type === 'event_msg' && stringValue(payload.type) === 'task_started') {
      turnId = stringValue(payload.turn_id) ?? turnId;
      continue;
    }
    if (event.type === 'turn_context') {
      turnId = stringValue(payload.turn_id) ?? turnId;
      cwd = stringValue(payload.cwd) ?? cwd;
      continue;
    }
    if (event.type !== 'response_item') continue;

    const payloadType = stringValue(payload.type);
    const callId = stringValue(payload.call_id);
    if (payloadType === 'function_call' && stringValue(payload.name) === 'exec_command') {
      const startedAt = stringValue(event.timestamp);
      const command = parseLegacyExecCommand(payload);
      if (!callId || !startedAt || !command) continue;
      candidates.push({
        ...command,
        callId,
        format: 'legacy',
        lineIndex,
        sessionId,
        turnId,
        contextCwd: cwd,
        startedAt,
        statusHint: normalizeStatus(stringValue(payload.status)),
      });
      continue;
    }
    if (payloadType === 'custom_tool_call' && stringValue(payload.name) === 'exec') {
      const startedAt = stringValue(event.timestamp);
      const source = stringValue(payload.input);
      if (!callId || !startedAt || !source) continue;
      const parsed = parseOrchestratedExecCommands(source, lineIndex);
      findings.push(...parsed.findings);
      for (const command of parsed.commands) {
        candidates.push({
          ...command,
          callId,
          format: 'orchestrated',
          lineIndex,
          sessionId,
          turnId,
          contextCwd: cwd,
          startedAt,
        });
      }
      continue;
    }
    if (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output') {
      if (!callId) continue;
      outputs.set(callId, {
        endedAt: stringValue(event.timestamp),
        output: payloadType === 'function_call_output' ? stringValue(payload.output) : undefined,
      });
    }
  }

  const reads: CodexSkillReadEvidence[] = [];
  for (const candidate of candidates) {
    const commandCwd = resolveCommandCwd(candidate.workdir, candidate.contextCwd);
    const rawSkillPaths = extractDirectSkillReadPaths(candidate.cmd);
    if (rawSkillPaths.length > MAX_SKILL_PATHS_PER_COMMAND) {
      findings.push({
        lineIndex: candidate.lineIndex,
        reason: 'analysis-budget-exceeded',
        count: 1,
      });
      continue;
    }
    const unresolvedRelativePathCount = rawSkillPaths.filter(skillPathNeedsCwd).length;
    const relativePathsAreUnresolved = candidate.workdirUnresolved === true || commandCwd === undefined;
    if (relativePathsAreUnresolved && unresolvedRelativePathCount > 0) {
      findings.push({
        lineIndex: candidate.lineIndex,
        reason: 'unresolved-workdir',
        count: unresolvedRelativePathCount,
      });
    }
    const output = outputs.get(candidate.callId);
    const status =
      candidate.format === 'orchestrated' ? 'unknown' : statusFromLegacyOutput(output?.output, candidate.statusHint);
    for (const rawSkillPath of rawSkillPaths) {
      if (relativePathsAreUnresolved && skillPathNeedsCwd(rawSkillPath)) continue;
      const skillPath = resolveSkillPath(rawSkillPath, commandCwd);
      if (!skillPath) continue;
      reads.push({
        callId: candidate.callId,
        lineIndex: candidate.lineIndex,
        sessionId: candidate.sessionId,
        turnId: candidate.turnId,
        skillPath,
        status,
        startedAt: candidate.startedAt,
        endedAt: output?.endedAt,
      });
    }
  }

  return { reads, findings: aggregateFindings(findings) };
}

function parseLegacyExecCommand(payload: Record<string, unknown>): ExecCommand | undefined {
  const raw = stringValue(payload.arguments) ?? stringValue(payload.input);
  if (!raw) return undefined;
  const value = parseJsonRecord(raw);
  if (!value) return undefined;
  const cmd = stringValue(value.cmd);
  if (!cmd) return undefined;
  return { cmd, workdir: stringValue(value.workdir) };
}

function parseOrchestratedExecCommands(
  source: string,
  lineIndex: number,
): {
  commands: ExecCommand[];
  findings: CodexEvidenceFinding[];
} {
  if (source.length > MAX_PROGRAM_SOURCE_LENGTH) {
    return {
      commands: [],
      findings: hasPotentialSkillEvidence(source) ? [{ lineIndex, reason: 'analysis-budget-exceeded', count: 1 }] : [],
    };
  }
  let program: Program;
  try {
    program = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch {
    return {
      commands: [],
      findings: hasPotentialSkillEvidence(source) ? [{ lineIndex, reason: 'invalid-javascript', count: 1 }] : [],
    };
  }

  const context: EvaluationContext = {
    budgetExceeded: false,
    commands: [],
    commandCount: 0,
    evaluationDepth: 0,
    evaluationSteps: 0,
    findings: [],
    iterations: 0,
    lineIndex,
    pathUnsupported: false,
    source,
    staticStringCodeUnits: 0,
  };
  executeStatements(program.body, new Map(), context, true);
  return { commands: context.commands, findings: context.findings };
}

function enterStaticEvaluation(context: EvaluationContext): boolean {
  if (context.budgetExceeded) return false;
  context.evaluationSteps += 1;
  if (context.evaluationSteps > MAX_STATIC_EVALUATION_STEPS || context.evaluationDepth >= MAX_STATIC_EVALUATION_DEPTH) {
    exceedAnalysisBudget(context);
    return false;
  }
  context.evaluationDepth += 1;
  return true;
}

function consumeStatementStep(context: EvaluationContext): boolean {
  if (context.budgetExceeded) return false;
  context.evaluationSteps += 1;
  if (context.evaluationSteps > MAX_STATIC_EVALUATION_STEPS) {
    exceedAnalysisBudget(context);
    return false;
  }
  return true;
}

function consumeIteration(context: EvaluationContext): boolean {
  if (context.budgetExceeded) return false;
  context.iterations += 1;
  if (context.iterations > MAX_STATIC_ITERATIONS) {
    exceedAnalysisBudget(context);
    return false;
  }
  return true;
}

function recordResolvedCommand(command: ExecCommand, context: EvaluationContext): void {
  if (context.budgetExceeded) return;
  if (extractDirectSkillReadPaths(command.cmd).length > MAX_SKILL_PATHS_PER_COMMAND) {
    exceedAnalysisBudget(context);
    return;
  }
  context.commandCount += 1;
  if (context.commandCount > MAX_STATIC_COMMANDS) {
    exceedAnalysisBudget(context);
    return;
  }
  context.commands.push(command);
}

function retainStaticString(value: string, context: EvaluationContext): StaticEvaluation {
  if (
    value.length > MAX_STATIC_STRING_LENGTH ||
    context.staticStringCodeUnits > MAX_STATIC_STRING_CODE_UNITS - value.length
  ) {
    exceedAnalysisBudget(context);
    return UNRESOLVED;
  }
  context.staticStringCodeUnits += value.length;
  return value;
}

function composeStaticString(parts: readonly string[], context: EvaluationContext): StaticEvaluation {
  let length = 0;
  for (const part of parts) {
    if (part.length > MAX_STATIC_STRING_LENGTH - length) {
      exceedAnalysisBudget(context);
      return UNRESOLVED;
    }
    length += part.length;
  }
  if (context.staticStringCodeUnits > MAX_STATIC_STRING_CODE_UNITS - length) {
    exceedAnalysisBudget(context);
    return UNRESOLVED;
  }
  context.staticStringCodeUnits += length;
  return parts.join('');
}

function exceedAnalysisBudget(context: EvaluationContext): void {
  if (context.budgetExceeded) return;
  context.budgetExceeded = true;
  context.pathUnsupported = true;
  context.commands.length = 0;
  context.findings.length = 0;
  if (hasPotentialSkillEvidence(context.source)) {
    context.findings.push({
      lineIndex: context.lineIndex,
      reason: 'analysis-budget-exceeded',
      count: 1,
    });
  }
}

function resolveExecCommand(
  call: CallExpression,
  environment: StaticEnvironment,
  context: EvaluationContext,
): ExecCommandResolution {
  const argument = call.arguments[0];
  if (!argument || argument.type === 'SpreadElement') {
    return { reason: 'unresolved-command', potentialSkillEvidence: false };
  }
  const options = evaluateStatic(argument, environment, context);
  if (!isStaticObject(options)) return { reason: 'unresolved-command', potentialSkillEvidence: false };
  const cmd = options.properties.get('cmd');
  if (typeof cmd !== 'string') return { reason: 'unresolved-command', potentialSkillEvidence: false };
  const potentialSkillEvidence = hasPotentialSkillEvidence(cmd);
  const hasWorkdir = options.properties.has('workdir');
  const workdir = options.properties.get('workdir');
  if (hasWorkdir && typeof workdir !== 'string') {
    return {
      command: { cmd, workdirUnresolved: true },
      potentialSkillEvidence,
    };
  }
  return {
    command: {
      cmd,
      workdir: typeof workdir === 'string' ? workdir : undefined,
    },
    potentialSkillEvidence,
  };
}

function recordUnresolvedExecFinding(
  call: CallExpression,
  reason: CodexEvidenceFindingReason | undefined,
  potentialSkillEvidence: boolean,
  context: EvaluationContext,
): void {
  if (!reason || (!potentialSkillEvidence && !hasPotentialSkillEvidence(context.source.slice(call.start, call.end)))) {
    return;
  }
  context.findings.push({
    lineIndex: context.lineIndex,
    reason,
    count: 1,
  });
}

function recordPathUnsupportedExecFinding(
  call: CallExpression,
  resolution: ExecCommandResolution,
  context: EvaluationContext,
): void {
  if (context.budgetExceeded) return;
  if (!resolution.command) {
    recordUnresolvedExecFinding(
      call,
      resolution.reason ?? 'unresolved-command',
      resolution.potentialSkillEvidence,
      context,
    );
    return;
  }
  const skillPaths = extractDirectSkillReadPaths(resolution.command.cmd);
  if (skillPaths.length > MAX_SKILL_PATHS_PER_COMMAND) {
    exceedAnalysisBudget(context);
    return;
  }
  const relativeSkillPathCount = skillPaths.filter(skillPathNeedsCwd).length;
  if (resolution.command.workdirUnresolved && relativeSkillPathCount > 0) {
    context.findings.push({
      lineIndex: context.lineIndex,
      reason: 'unresolved-workdir',
      count: relativeSkillPathCount,
    });
  } else if (skillPaths.length > 0) {
    context.findings.push({
      lineIndex: context.lineIndex,
      reason: 'unresolved-command',
      count: skillPaths.length,
    });
  }
}

function hasPotentialSkillEvidence(value: string): boolean {
  return value.includes('SKILL.md');
}

function aggregateFindings(findings: CodexEvidenceFinding[]): CodexEvidenceFinding[] {
  const aggregated = new Map<CodexEvidenceFindingReason, CodexEvidenceFinding>();
  for (const finding of findings) {
    const existing = aggregated.get(finding.reason);
    if (existing) {
      existing.count += finding.count;
    } else {
      aggregated.set(finding.reason, { ...finding });
    }
  }
  return [...aggregated.values()].sort(
    (left, right) => left.lineIndex - right.lineIndex || left.reason.localeCompare(right.reason),
  );
}

function isToolsExecCommand(call: CallExpression, environment: StaticEnvironment): boolean {
  if (environment.has('tools')) return false;
  if (
    call.callee.type !== 'MemberExpression' ||
    call.callee.object.type !== 'Identifier' ||
    call.callee.object.name !== 'tools'
  ) {
    return false;
  }
  if (!call.callee.computed) {
    return call.callee.property.type === 'Identifier' && call.callee.property.name === 'exec_command';
  }
  return call.callee.property.type === 'Literal' && call.callee.property.value === 'exec_command';
}

function propertyName(key: Expression): string | undefined {
  if (key.type === 'Identifier') return key.name;
  return key.type === 'Literal' && (typeof key.value === 'string' || typeof key.value === 'number')
    ? String(key.value)
    : undefined;
}

function evaluateStatic(
  expression: Expression,
  environment: StaticEnvironment,
  context: EvaluationContext,
): StaticEvaluation {
  if (!enterStaticEvaluation(context)) return UNRESOLVED;
  try {
    return evaluateStaticExpression(expression, environment, context);
  } finally {
    context.evaluationDepth -= 1;
  }
}

function evaluateStaticExpression(
  expression: Expression,
  environment: StaticEnvironment,
  context: EvaluationContext,
): StaticEvaluation {
  if (expression.type === 'Literal') {
    return typeof expression.value === 'string' ? retainStaticString(expression.value, context) : UNRESOLVED;
  }
  if (expression.type === 'Identifier') {
    if (environment.has(expression.name)) {
      const binding = environment.get(expression.name);
      if (binding === UNINITIALIZED) {
        context.pathUnsupported = true;
        return UNRESOLVED;
      }
      return binding ?? UNRESOLVED;
    }
    context.pathUnsupported = true;
    return UNRESOLVED;
  }
  if (expression.type === 'AssignmentExpression') {
    context.pathUnsupported = true;
    return UNRESOLVED;
  }
  if (expression.type === 'UpdateExpression') {
    context.pathUnsupported = true;
    return UNRESOLVED;
  }
  if (expression.type === 'UnaryExpression' && expression.operator === 'delete') {
    context.pathUnsupported = true;
    return UNRESOLVED;
  }
  if (expression.type === 'BinaryExpression' && expression.operator === '+') {
    if (expression.left.type === 'PrivateIdentifier') return UNRESOLVED;
    const left = evaluateStatic(expression.left, environment, context);
    if (context.pathUnsupported) return UNRESOLVED;
    const right = evaluateStatic(expression.right, environment, context);
    if (typeof left !== 'string' || typeof right !== 'string') {
      context.pathUnsupported = true;
      return UNRESOLVED;
    }
    return composeStaticString([left, right], context);
  }
  if (expression.type === 'TemplateLiteral') {
    const parts: string[] = [];
    for (const [index, quasi] of expression.quasis.entries()) {
      parts.push(quasi.value.cooked ?? quasi.value.raw);
      const substitution = expression.expressions[index];
      if (!substitution) continue;
      const resolved = evaluateStatic(substitution, environment, context);
      if (typeof resolved !== 'string') {
        context.pathUnsupported = true;
        return UNRESOLVED;
      }
      parts.push(resolved);
    }
    return composeStaticString(parts, context);
  }
  if (expression.type === 'ObjectExpression') {
    const properties = new Map<string, StaticEvaluation>();
    for (const candidate of expression.properties) {
      if (candidate.type !== 'Property' || candidate.kind !== 'init' || candidate.computed) {
        context.pathUnsupported = true;
        return UNRESOLVED;
      }
      const name = propertyName(candidate.key);
      if (name === undefined) {
        context.pathUnsupported = true;
        return UNRESOLVED;
      }
      properties.set(name, evaluateStatic(candidate.value, environment, context));
      if (context.pathUnsupported) return { kind: 'object', properties };
    }
    return { kind: 'object', properties };
  }
  if (expression.type === 'ArrayExpression') {
    const items: StaticValue[] = [];
    let allItemsResolved = true;
    for (const element of expression.elements) {
      if (!element) {
        allItemsResolved = false;
        continue;
      }
      if (element.type === 'SpreadElement') {
        context.pathUnsupported = true;
        return UNRESOLVED;
      }
      const value = evaluateStatic(element, environment, context);
      if (context.pathUnsupported) return UNRESOLVED;
      if (value === UNRESOLVED) allItemsResolved = false;
      else items.push(value);
    }
    return allItemsResolved ? { kind: 'array', items } : UNRESOLVED;
  }
  if (expression.type === 'MemberExpression') {
    if (expression.object.type === 'Super') return UNRESOLVED;
    const object = evaluateStatic(expression.object, environment, context);
    if (context.pathUnsupported) return UNRESOLVED;
    const name = memberPropertyName(expression.property, expression.computed, environment, context);
    if (context.pathUnsupported) return UNRESOLVED;
    if (object === UNRESOLVED) {
      context.pathUnsupported = true;
      return UNRESOLVED;
    }
    if (isStaticOpaqueObject(object)) return STATIC_OPAQUE_LEAF;
    if (isStaticOpaqueLeaf(object)) {
      context.pathUnsupported = true;
      return UNRESOLVED;
    }
    if (!isStaticObject(object)) return UNRESOLVED;
    if (name === undefined) {
      context.pathUnsupported = true;
      return UNRESOLVED;
    }
    return object.properties.get(name) ?? UNRESOLVED;
  }
  if (expression.type === 'ArrowFunctionExpression' || expression.type === 'FunctionExpression') {
    if (expression.generator) return UNRESOLVED;
    return {
      kind: 'function',
      params: expression.params,
      body: expression.body,
      environment,
      localName: expression.type === 'FunctionExpression' ? expression.id?.name : undefined,
    };
  }
  if (expression.type === 'AwaitExpression') {
    const awaited = evaluateStatic(expression.argument, environment, context);
    if (context.pathUnsupported) return UNRESOLVED;
    if (
      awaited === UNRESOLVED ||
      isStaticOpaqueLeaf(awaited) ||
      (isStaticObject(awaited) && awaited.properties.has('then'))
    ) {
      context.pathUnsupported = true;
      return UNRESOLVED;
    }
    return awaited;
  }
  if (expression.type === 'CallExpression') {
    if (isToolsExecCommand(expression, environment)) {
      if (expression.arguments.length !== 1 || expression.arguments[0].type === 'SpreadElement') {
        context.pathUnsupported = true;
        recordUnresolvedExecFinding(expression, 'unresolved-command', false, context);
        return UNRESOLVED;
      }
      const resolution = resolveExecCommand(expression, environment, context);
      if (context.pathUnsupported) {
        recordPathUnsupportedExecFinding(expression, resolution, context);
        return UNRESOLVED;
      }
      if (resolution.command) {
        recordResolvedCommand(resolution.command, context);
        return context.pathUnsupported ? UNRESOLVED : STATIC_OPAQUE_OBJECT;
      }
      recordUnresolvedExecFinding(expression, resolution.reason, resolution.potentialSkillEvidence, context);
      context.pathUnsupported = true;
      return UNRESOLVED;
    }
    if (invalidateKnownMutationCall(expression, environment, context)) return UNRESOLVED;
    if (isPromiseAllCall(expression, environment)) {
      const argument = expression.arguments[0];
      if (expression.arguments.length !== 1 || !argument || argument.type === 'SpreadElement') {
        context.pathUnsupported = true;
        return UNRESOLVED;
      }
      const iterable = evaluateStatic(argument, environment, context);
      if (context.pathUnsupported) return UNRESOLVED;
      if (!isStaticArray(iterable) || iterable.items.some(isUnprovenPromiseInput)) {
        context.pathUnsupported = true;
        return UNRESOLVED;
      }
      return STATIC_OPAQUE_OBJECT;
    }
    if (isArrayMapCall(expression)) {
      const receiver = evaluateStatic(expression.callee.object as Expression, environment, context);
      const callbackArgument = expression.arguments[0];
      if (context.pathUnsupported) return UNRESOLVED;
      if (
        !isStaticArray(receiver) ||
        expression.arguments.length !== 1 ||
        !callbackArgument ||
        callbackArgument.type === 'SpreadElement'
      ) {
        context.pathUnsupported = true;
        return UNRESOLVED;
      }
      const callback = evaluateStatic(callbackArgument, environment, context);
      if (context.pathUnsupported) return UNRESOLVED;
      if (!isStaticFunction(callback)) {
        context.pathUnsupported = true;
        return UNRESOLVED;
      }
      const results: StaticValue[] = [];
      let allResultsResolved = true;
      for (const item of receiver.items) {
        if (!consumeIteration(context)) return UNRESOLVED;
        const result = invokeStaticFunction(callback, [item], context);
        if (context.pathUnsupported) return UNRESOLVED;
        if (result === UNRESOLVED) {
          allResultsResolved = false;
        } else {
          results.push(result);
        }
      }
      return allResultsResolved ? { kind: 'array', items: results } : UNRESOLVED;
    }
    if (isKnownOrchestrationHelperCall(expression, environment)) {
      for (const argument of expression.arguments) {
        if (argument.type === 'SpreadElement') {
          context.pathUnsupported = true;
          break;
        }
        evaluateStatic(argument, environment, context);
        if (context.pathUnsupported) break;
      }
      return UNRESOLVED;
    }
    context.pathUnsupported = true;
  }
  if (UNSUPPORTED_RUNTIME_EXPRESSIONS.has(expression.type)) context.pathUnsupported = true;
  return UNRESOLVED;
}

function executeStatements(
  statements: readonly (Statement | ModuleDeclaration)[],
  environment: StaticEnvironment,
  context: EvaluationContext,
  functionScope = false,
): ExecutionCompletion {
  if (functionScope) predeclareFunctionScopedBindings(statements, environment);
  predeclareBindings(statements, environment);
  for (const statement of statements) {
    if (!consumeStatementStep(context)) return { kind: 'unsupported' };
    if (statement.type === 'VariableDeclaration') {
      for (const declaration of statement.declarations) {
        const value = declaration.init ? evaluateStatic(declaration.init, environment, context) : UNRESOLVED;
        if (context.pathUnsupported) return { kind: 'unsupported' };
        if (declaration.id.type === 'Identifier') {
          environment.set(declaration.id.name, statement.kind === 'const' ? value : UNRESOLVED);
        }
      }
      continue;
    }
    if (statement.type === 'ExpressionStatement') {
      evaluateStatic(statement.expression, environment, context);
      if (context.pathUnsupported) return { kind: 'unsupported' };
      continue;
    }
    if (statement.type === 'BlockStatement') {
      const completion = executeStatements(statement.body, new Map(environment), context);
      if (completion.kind !== 'normal') return completion;
      continue;
    }
    if (statement.type === 'ForOfStatement') {
      const completion = executeForOf(statement, environment, context);
      if (completion.kind !== 'normal') return completion;
      continue;
    }
    if (statement.type === 'ReturnStatement') {
      const value = statement.argument ? evaluateStatic(statement.argument, environment, context) : UNRESOLVED;
      if (context.pathUnsupported) return { kind: 'unsupported' };
      return {
        kind: 'return',
        value,
      };
    }
    if (statement.type === 'BreakStatement') return { kind: 'break' };
    if (statement.type === 'ContinueStatement') return { kind: 'continue' };
    if (
      statement.type === 'EmptyStatement' ||
      statement.type === 'DebuggerStatement' ||
      statement.type === 'FunctionDeclaration'
    ) {
      continue;
    }
    return { kind: 'unsupported' };
  }
  return { kind: 'normal' };
}

function predeclareBindings(
  statements: readonly (Statement | ModuleDeclaration)[],
  environment: StaticEnvironment,
): void {
  for (const statement of statements) {
    if (statement.type === 'VariableDeclaration') {
      for (const declaration of statement.declarations) {
        bindPattern(declaration.id, environment, statement.kind === 'var' ? UNRESOLVED : UNINITIALIZED);
      }
    } else if (statement.type === 'FunctionDeclaration') {
      environment.set(statement.id.name, UNRESOLVED);
    } else if (statement.type === 'ClassDeclaration') {
      environment.set(statement.id.name, UNINITIALIZED);
    } else if (statement.type === 'ImportDeclaration') {
      for (const specifier of statement.specifiers) environment.set(specifier.local.name, UNRESOLVED);
    }
  }
}

function predeclareFunctionScopedBindings(
  statements: readonly (Statement | ModuleDeclaration)[],
  environment: StaticEnvironment,
): void {
  for (const statement of statements) collectFunctionScopedBindings(statement, environment);
}

function collectFunctionScopedBindings(statement: Statement | ModuleDeclaration, environment: StaticEnvironment): void {
  if (statement.type === 'VariableDeclaration') {
    if (statement.kind !== 'var') return;
    for (const declaration of statement.declarations) {
      bindPattern(declaration.id, environment, UNRESOLVED);
    }
    return;
  }
  if (statement.type === 'BlockStatement') {
    for (const child of statement.body) collectFunctionScopedBindings(child, environment);
    return;
  }
  if (statement.type === 'IfStatement') {
    collectFunctionScopedBindings(statement.consequent, environment);
    if (statement.alternate) collectFunctionScopedBindings(statement.alternate, environment);
    return;
  }
  if (statement.type === 'ForStatement') {
    if (statement.init?.type === 'VariableDeclaration') {
      collectFunctionScopedBindings(statement.init, environment);
    }
    collectFunctionScopedBindings(statement.body, environment);
    return;
  }
  if (statement.type === 'ForInStatement' || statement.type === 'ForOfStatement') {
    if (statement.left.type === 'VariableDeclaration') {
      collectFunctionScopedBindings(statement.left, environment);
    }
    collectFunctionScopedBindings(statement.body, environment);
    return;
  }
  if (statement.type === 'WhileStatement' || statement.type === 'DoWhileStatement') {
    collectFunctionScopedBindings(statement.body, environment);
    return;
  }
  if (statement.type === 'SwitchStatement') {
    for (const switchCase of statement.cases) {
      for (const child of switchCase.consequent) {
        collectFunctionScopedBindings(child, environment);
      }
    }
    return;
  }
  if (statement.type === 'TryStatement') {
    collectFunctionScopedBindings(statement.block, environment);
    if (statement.handler) collectFunctionScopedBindings(statement.handler.body, environment);
    if (statement.finalizer) collectFunctionScopedBindings(statement.finalizer, environment);
    return;
  }
  if (statement.type === 'LabeledStatement' || statement.type === 'WithStatement') {
    collectFunctionScopedBindings(statement.body, environment);
    return;
  }
  if (statement.type === 'ExportNamedDeclaration' && statement.declaration) {
    collectFunctionScopedBindings(statement.declaration, environment);
  }
}

function bindPattern(pattern: Pattern, environment: StaticEnvironment, value: StaticBinding): void {
  if (pattern.type === 'Identifier') {
    environment.set(pattern.name, value);
  } else if (pattern.type === 'ObjectPattern') {
    for (const property of pattern.properties) {
      bindPattern(property.type === 'RestElement' ? property.argument : property.value, environment, value);
    }
  } else if (pattern.type === 'ArrayPattern') {
    for (const element of pattern.elements) {
      if (element) bindPattern(element, environment, value);
    }
  } else if (pattern.type === 'RestElement') {
    bindPattern(pattern.argument, environment, value);
  } else if (pattern.type === 'AssignmentPattern') {
    bindPattern(pattern.left, environment, value);
  }
}

function invalidateStaticValue(value: StaticEvaluation): void {
  if (isStaticObject(value)) {
    value.properties.clear();
  } else if (isStaticArray(value)) {
    value.items.length = 0;
  }
}

function invalidateKnownMutationCall(
  call: CallExpression,
  environment: StaticEnvironment,
  context: EvaluationContext,
): boolean {
  if (isObjectAssignCall(call, environment)) {
    const target = call.arguments[0];
    if (!target || target.type === 'SpreadElement') {
      context.pathUnsupported = true;
      return true;
    }
    const value = evaluateStatic(target, environment, context);
    if (context.pathUnsupported) return true;
    for (const argument of call.arguments.slice(1)) {
      if (argument.type === 'SpreadElement') {
        context.pathUnsupported = true;
        return true;
      }
      evaluateStatic(argument, environment, context);
      if (context.pathUnsupported) return true;
    }
    invalidateStaticValue(value);
    const rootName = target.type === 'Identifier' ? target.name : memberRootIdentifier(target);
    if (rootName) environment.set(rootName, UNRESOLVED);
    context.pathUnsupported = true;
    return true;
  }
  if (call.callee.type !== 'MemberExpression' || call.callee.object.type === 'Super') return false;
  const method = memberPropertyName(call.callee.property, call.callee.computed, environment, context);
  if (context.pathUnsupported) return true;
  if (!method || !ARRAY_MUTATOR_METHODS.has(method)) return false;
  const receiver = evaluateStatic(call.callee.object, environment, context);
  if (context.pathUnsupported) return true;
  if (!isStaticArray(receiver)) return false;
  for (const argument of call.arguments) {
    if (argument.type === 'SpreadElement') {
      context.pathUnsupported = true;
      return true;
    }
    evaluateStatic(argument, environment, context);
    if (context.pathUnsupported) return true;
  }
  invalidateStaticValue(receiver);
  const rootName = memberRootIdentifier(call.callee.object);
  if (rootName) environment.set(rootName, UNRESOLVED);
  context.pathUnsupported = true;
  return true;
}

function isObjectAssignCall(call: CallExpression, environment: StaticEnvironment): boolean {
  if (environment.has('Object')) return false;
  return (
    call.callee.type === 'MemberExpression' &&
    !call.callee.computed &&
    call.callee.object.type === 'Identifier' &&
    call.callee.object.name === 'Object' &&
    call.callee.property.type === 'Identifier' &&
    call.callee.property.name === 'assign'
  );
}

function memberRootIdentifier(expression: Expression): string | undefined {
  if (expression.type === 'Identifier') return expression.name;
  if (expression.type !== 'MemberExpression' || expression.object.type === 'Super') return undefined;
  return memberRootIdentifier(expression.object);
}

function executeForOf(
  statement: Extract<Statement, { type: 'ForOfStatement' }>,
  environment: StaticEnvironment,
  context: EvaluationContext,
): ExecutionCompletion {
  if (
    statement.left.type !== 'VariableDeclaration' ||
    statement.left.kind !== 'const' ||
    statement.left.declarations.length !== 1 ||
    statement.left.declarations[0].id.type !== 'Identifier'
  ) {
    return { kind: 'unsupported' };
  }
  const iterable = evaluateStatic(statement.right, environment, context);
  if (context.pathUnsupported) return { kind: 'unsupported' };
  if (!isStaticArray(iterable)) return { kind: 'unsupported' };
  const binding = statement.left.declarations[0].id.name;
  for (const item of iterable.items) {
    if (!consumeIteration(context)) return { kind: 'unsupported' };
    const iterationEnvironment = new Map(environment);
    iterationEnvironment.set(binding, item);
    const completion = executeStatements([statement.body], iterationEnvironment, context);
    if (completion.kind === 'normal' || completion.kind === 'continue') continue;
    if (completion.kind === 'break') return { kind: 'normal' };
    return completion;
  }
  return { kind: 'normal' };
}

function invokeStaticFunction(
  fn: StaticFunction,
  arguments_: StaticEvaluation[],
  context: EvaluationContext,
): StaticEvaluation {
  const functionEnvironment = new Map(fn.environment);
  if (fn.localName) functionEnvironment.set(fn.localName, UNRESOLVED);
  for (const [index, parameter] of fn.params.entries()) {
    if (parameter.type !== 'Identifier') {
      context.pathUnsupported = true;
      return UNRESOLVED;
    }
    functionEnvironment.set(parameter.name, arguments_[index] ?? UNRESOLVED);
  }
  if (fn.body.type !== 'BlockStatement') return evaluateStatic(fn.body, functionEnvironment, context);
  const completion = executeStatements(fn.body.body, functionEnvironment, context, true);
  if (completion.kind === 'unsupported') context.pathUnsupported = true;
  return completion.kind === 'return' ? completion.value : UNRESOLVED;
}

function memberPropertyName(
  property: Expression | { type: 'PrivateIdentifier' },
  computed: boolean,
  environment: StaticEnvironment,
  context: EvaluationContext,
): string | undefined {
  if (!computed) return property.type === 'Identifier' ? property.name : undefined;
  if (property.type === 'PrivateIdentifier') return undefined;
  const value = evaluateStatic(property, environment, context);
  return typeof value === 'string' ? value : undefined;
}

function isPromiseAllCall(call: CallExpression, environment: StaticEnvironment): boolean {
  if (environment.has('Promise')) return false;
  return (
    call.callee.type === 'MemberExpression' &&
    !call.callee.computed &&
    call.callee.object.type === 'Identifier' &&
    call.callee.object.name === 'Promise' &&
    call.callee.property.type === 'Identifier' &&
    call.callee.property.name === 'all'
  );
}

function isKnownOrchestrationHelperCall(call: CallExpression, environment: StaticEnvironment): boolean {
  return (
    call.callee.type === 'Identifier' &&
    !environment.has(call.callee.name) &&
    CODEX_ORCHESTRATION_HELPERS.has(call.callee.name)
  );
}

function isArrayMapCall(call: CallExpression): call is CallExpression & {
  callee: Extract<Expression, { type: 'MemberExpression' }>;
} {
  return (
    call.callee.type === 'MemberExpression' &&
    !call.callee.computed &&
    call.callee.object.type !== 'Super' &&
    call.callee.property.type === 'Identifier' &&
    call.callee.property.name === 'map'
  );
}

function isStaticObject(value: StaticEvaluation): value is StaticObject {
  return typeof value !== 'string' && value !== UNRESOLVED && value.kind === 'object';
}

function isStaticArray(value: StaticEvaluation): value is StaticArray {
  return typeof value !== 'string' && value !== UNRESOLVED && value.kind === 'array';
}

function isStaticFunction(value: StaticEvaluation): value is StaticFunction {
  return typeof value !== 'string' && value !== UNRESOLVED && value.kind === 'function';
}

function isStaticOpaqueObject(value: StaticEvaluation): value is StaticOpaqueObject {
  return typeof value !== 'string' && value !== UNRESOLVED && value.kind === 'opaque-object';
}

function isStaticOpaqueLeaf(value: StaticEvaluation): value is StaticOpaqueLeaf {
  return typeof value !== 'string' && value !== UNRESOLVED && value.kind === 'opaque-leaf';
}

function isUnprovenPromiseInput(value: StaticValue): boolean {
  return isStaticOpaqueLeaf(value) || (isStaticObject(value) && value.properties.has('then'));
}

function extractDirectSkillReadPaths(command: string): string[] {
  const paths: string[] = [];
  const uncommentedCommand = stripUnquotedShellComments(command);
  const segments = uncommentedCommand.split(/\s*(?:&&|\|\||;|\n)\s*/);
  for (const segment of segments) {
    const commandName = path.basename(segment.trim().match(/^(\S+)/)?.[1] ?? '');
    if (!['cat', 'sed', 'nl', 'head', 'tail', 'bat'].includes(commandName)) continue;
    const pathPattern = /(?:^|\s|['"])(~?\.?\.?\/?[^'"\s]*\/skills\/[^'"\s]+\/SKILL\.md)(?=$|\s|['"])/g;
    for (const match of segment.matchAll(pathPattern)) {
      const skillPath = match[1];
      if (!skillPath.includes('<') && !skillPath.includes('>')) {
        paths.push(skillPath);
        if (paths.length > MAX_SKILL_PATHS_PER_COMMAND) return paths;
      }
    }
  }
  return paths;
}

function stripUnquotedShellComments(command: string): string {
  let uncommented = '';
  let quote: "'" | '"' | undefined;
  let escaped = false;
  let inComment = false;
  let atWordStart = true;
  for (const character of command) {
    if (inComment) {
      if (character === '\n') {
        inComment = false;
        atWordStart = true;
        uncommented += character;
      }
      continue;
    }
    if (escaped) {
      escaped = false;
      atWordStart = false;
      uncommented += character;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      else if (quote === '"' && character === '\\') escaped = true;
      uncommented += character;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      atWordStart = false;
      uncommented += character;
    } else if (character === "'" || character === '"') {
      quote = character;
      atWordStart = false;
      uncommented += character;
    } else if (character === '#' && atWordStart) {
      inComment = true;
    } else {
      atWordStart = /\s/.test(character);
      uncommented += character;
    }
  }
  return uncommented;
}

function resolveCommandCwd(workdir: string | undefined, cwd: string | undefined): string | undefined {
  if (!workdir) return cwd && path.isAbsolute(cwd) ? cwd : undefined;
  if (path.isAbsolute(workdir)) return workdir;
  return cwd && path.isAbsolute(cwd) ? path.resolve(cwd, workdir) : undefined;
}

function skillPathNeedsCwd(skillPath: string): boolean {
  return !path.isAbsolute(skillPath) && skillPath !== '~' && !skillPath.startsWith('~/');
}

function resolveSkillPath(rawSkillPath: string, cwd: string | undefined): string | undefined {
  if (rawSkillPath === '~') return os.homedir();
  if (rawSkillPath.startsWith('~/')) return path.join(os.homedir(), rawSkillPath.slice(2));
  if (path.isAbsolute(rawSkillPath)) return path.normalize(rawSkillPath);
  return cwd ? path.resolve(cwd, rawSkillPath) : undefined;
}

function statusFromLegacyOutput(
  output: string | undefined,
  statusHint: CodexSkillReadStatus | undefined,
): CodexSkillReadStatus {
  const exitCode =
    output?.match(/Process exited with code\s+(\d+)/)?.[1] ??
    output?.match(/Exit code:\s+(\d+)/)?.[1] ??
    output?.match(/Exit status\s+(\d+)/)?.[1];
  if (exitCode !== undefined) return exitCode === '0' ? 'used' : 'failed';
  return statusHint ?? 'unknown';
}

function normalizeStatus(value: string | undefined): CodexSkillReadStatus {
  if (value === 'loaded' || value === 'used' || value === 'failed') return value;
  return 'unknown';
}

function parseJsonRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
