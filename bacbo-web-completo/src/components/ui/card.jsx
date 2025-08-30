import React from "react";
export function Card({ children, className = "" }) { return <div className={`p-4 bg-white rounded-2xl shadow ${className}`}>{children}</div>; }
export function CardHeader({ children }) { return <div className="mb-2">{children}</div>; }
export function CardTitle({ children }) { return <h3 className="text-lg font-semibold">{children}</h3>; }
export function CardDescription({ children }) { return <p className="text-sm text-zinc-500">{children}</p>; }
export function CardContent({ children }) { return <div>{children}</div>; }
export default Card;
