# shadcn/ui — high-severity implementation guidelines

Subordinate to Emil + Impeccable + Taste. Implementation correctness only; never visual direction.

## Setup

- **Use CLI for installation** — Do: npx shadcn@latest add component-name · Don't: Manual copy-paste from docs
- **Initialize project properly** — Do: npx shadcn@latest init before adding components · Don't: Skip init and add components directly

## Theming

- **Use CSS variables for colors** — Do: CSS variables in :root and .dark · Don't: Hardcoded color values in components
- **Support dark mode** — Do: Define both :root and .dark color schemes · Don't: Only light mode colors

## Dialog

- **Use Dialog for modal content** — Do: Dialog for confirmations forms details · Don't: Alert for modal content
- **Include proper dialog structure** — Do: Complete semantic structure · Don't: Missing title or description

## Form

- **Use Form with react-hook-form** — Do: useForm + Form + FormField pattern · Don't: Custom form handling without Form
- **Use FormField for inputs** — Do: FormField + FormItem + FormLabel + FormControl · Don't: Input without FormField wrapper

## Select

- **Structure Select properly** — Do: Complete Select structure · Don't: Missing SelectValue or SelectContent

## Table

- **Include proper table structure** — Do: Semantic table structure · Don't: Missing thead or tbody

## Toast

- **Add Toaster to layout** — Do: <Toaster /> in app layout · Don't: Toaster in individual pages

## Tooltip

- **Add TooltipProvider** — Do: TooltipProvider at app level · Don't: TooltipProvider per tooltip

## AlertDialog

- **Use AlertDialog for confirms** — Do: AlertDialog for delete confirmations · Don't: Dialog for confirmations

## Sidebar

- **Wrap in SidebarProvider** — Do: SidebarProvider at layout level · Don't: Sidebar without provider

## A11y

- **Use semantic components** — Do: Rely on component accessibility · Don't: Override ARIA attributes
- **Maintain focus management** — Do: Let components manage focus · Don't: Custom focus handling
- **Provide labels** — Do: FormLabel for form inputs · Don't: Placeholder as only label

## Patterns

- **Combine with React Hook Form** — Do: RHF Controller with shadcn inputs · Don't: Custom form state management
