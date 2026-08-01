import React from 'react';

function BrandLogo({ size = "medium", onClick, style }) {
  const isSmall = size === "small";
  const isLarge = size === "large";

  const fontSize = isSmall ? "1.25rem" : isLarge ? "2.2rem" : "1.6rem";
  const letterSpacing = isLarge ? "0.22em" : "0.18em";

  return (
    <div
      className="brand-logo-container"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        ...style
      }}
    >
      <span
        style={{
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontSize,
          fontWeight: 800,
          letterSpacing,
          color: "#111827",
          textTransform: "uppercase",
          lineHeight: 1
        }}
      >
        SAMRAG
      </span>
      <span
        style={{
          marginLeft: "6px",
          padding: "2px 6px",
          background: "linear-gradient(135deg, #111827 0%, #374151 100%)",
          color: "#ffffff",
          fontSize: isSmall ? "0.65rem" : isLarge ? "0.85rem" : "0.75rem",
          fontWeight: 700,
          borderRadius: "4px",
          letterSpacing: "0.1em"
        }}
      >
        AI
      </span>
    </div>
  );
}

export default React.memo(BrandLogo);
