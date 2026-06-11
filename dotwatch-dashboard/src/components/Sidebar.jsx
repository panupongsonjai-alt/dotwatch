import React from 'react'

function Sidebar({ page, setPage }) {
  const menus = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "devices", label: "Devices", icon: "📡" },
    { id: "settings", label: "Settings", icon: "⚙️" },
    { id: "profile", label: "Profile", icon: "👤" },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-dot"></span>
        <div>
          <strong>dotWatch</strong>
          <small>IoT Monitoring</small>
        </div>
      </div>

      <nav className="menu">
        {menus.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`menu-item ${page === item.id ? "active" : ""}`}
            onClick={() => setPage(item.id)}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;