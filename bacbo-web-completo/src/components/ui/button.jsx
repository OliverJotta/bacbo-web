import React from "react";
export function Button({ children, className = "", ...props }) {
  return (
    <button {...props} className={`px-3 py-2 rounded-2xl text-sm shadow-sm ${className}`}>
      {children}
    </button>
  );
}
export default Button;
