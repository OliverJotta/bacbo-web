import React, { createContext, useContext, useState } from "react";
const Ctx = createContext({});
export function Tabs({ children, defaultValue }) {
  const [active, setActive] = useState(defaultValue);
  return <Ctx.Provider value={{ active, setActive }}>{children}</Ctx.Provider>;
}
export function TabsList({ children }) { return <div className="flex gap-2 mb-3">{children}</div>; }
export function TabsTrigger({ children, value }) {
  const { active, setActive } = useContext(Ctx);
  const isActive = active === value;
  return (
    <button onClick={() => setActive(value)} className={`px-3 py-1 rounded ${isActive ? "bg-zinc-200" : "bg-transparent"}`}>
      {children}
    </button>
  );
}
export function TabsContent({ children, value }) {
  const { active } = useContext(Ctx);
  return active === value ? <div>{children}</div> : null;
}
export default Tabs;
