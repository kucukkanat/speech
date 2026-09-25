import clsx from "clsx";
import { type HTMLMotionProps, motion } from "motion/react";
import { forwardRef, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  children?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-white shadow-[0_10px_30px_-10px_rgb(228_107_255/0.65),inset_0_1px_0_rgb(255_255_255/0.3)] hover:shadow-[0_14px_40px_-8px_rgb(228_107_255/0.8),inset_0_1px_0_rgb(255_255_255/0.3)] hover:brightness-110",
  secondary:
    "bg-white/[0.06] text-white/90 border border-white/10 hover:bg-white/[0.1] hover:border-white/20 hover:shadow-[0_0_24px_-6px_rgb(124_108_255/0.5)]",
  ghost: "text-white/70 hover:text-white hover:bg-white/[0.07]",
  danger: "bg-danger-500/15 text-danger-200 border border-danger-400/20 hover:bg-danger-500/25",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-[15px] gap-2.5 rounded-2xl",
  icon: "h-10 w-10 rounded-xl",
  "icon-sm": "h-8 w-8 rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, children, className, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      {...(disabled ? {} : { whileTap: { scale: 0.95 } })}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      className={clsx(
        "relative inline-flex shrink-0 select-none items-center justify-center font-medium whitespace-nowrap transition-[background,box-shadow,border-color,color,filter,opacity] duration-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </motion.button>
  );
});
