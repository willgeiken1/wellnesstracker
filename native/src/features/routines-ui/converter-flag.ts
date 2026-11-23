/**
 * The concentration converter can be cut from a build by setting this to false (App Review 1.4.2).
 * While it is false nothing of it is drawn or named anywhere: no tool on the Peptides tab, no button in an
 * item's details, no link on the dose card, no converter sheet, no line in Routines settings, no question in
 * the FAQ and nothing to add under "Add to your page". Every one of those asks `converterShown`.
 * The converter is unit arithmetic on numbers the user types. It has no drug list and never suggests an amount.
 */
export const CONCENTRATION_CONVERTER_ENABLED: boolean = true;
