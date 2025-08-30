import React from "react";
export function Input(props) {
  return <input {...props} className={`px-3 py-2 rounded-lg border text-sm ${props.className || ""}`} />;
}
export default Input;
