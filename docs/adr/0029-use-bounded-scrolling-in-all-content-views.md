# Use bounded scrolling in all content views

Every Skillpack content view that can exceed the viewport will use explicit bounded scrolling within the Terminal Envelope. Inventory, Project Skills, Settings, Updates results, Install results, and Detail sections should reserve stable space for headers and status bars, then scroll only their content region so compact terminals do not hide navigation or action state.
