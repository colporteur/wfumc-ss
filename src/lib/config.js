// Centralized constants for the Sunday School app.
//
// The class name is hard-coded because there's only one class. If a
// second class is ever added, the model would change to a class table
// + scope every query — keep that in mind before "just change this
// string" thinking.

export const CLASS_NAME = "Todd & Tyler's Excellent Adventure Sunday School Class";
export const CLASS_SHORT_NAME = "Todd & Tyler's Excellent Adventure";

// Class meeting time, used by the homework auto-expiration logic.
// We meet 9:00–9:30 AM Central. Homework expires at end-of-class.
export const CLASS_DAY_OF_WEEK = 0; // 0 = Sunday (JS Date.getDay() convention)
export const CLASS_START_HOUR_CT = 9; // 9 AM Central
export const CLASS_END_HOUR_CT = 9;
export const CLASS_END_MINUTE_CT = 30; // 9:30 AM Central

// IANA timezone used to anchor the class clock regardless of where the
// pastor or class members are physically.
export const CLASS_TIMEZONE = 'America/Chicago';
