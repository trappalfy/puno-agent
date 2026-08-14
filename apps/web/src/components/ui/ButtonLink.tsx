import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonClasses, type ButtonShape, type ButtonVariant } from "./Button";

/// A navigation link that looks like a button.
///
/// Not `<Link><Button/></Link>`: that nests a <button> inside an <a>, which is
/// invalid HTML and gives assistive tech two overlapping controls for one
/// target. Sidebar.tsx worked around it by hand-copying the button's classes
/// onto a Link, which then had to be kept in sync by hand — this is that fix,
/// sharing the class builder rather than duplicating the string.
export function ButtonLink({
  variant = "primary",
  shape = "default",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; shape?: ButtonShape }) {
  return <Link className={buttonClasses(variant, shape, className)} {...props} />;
}
