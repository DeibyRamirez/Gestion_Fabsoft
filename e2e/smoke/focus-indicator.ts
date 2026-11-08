import { expect, type Locator } from '@playwright/test';

/** Lógica duplicada en el browser vía evaluate (sin imports en página). */
export async function expectVisibleFocusIndicator(locator: Locator) {
  const result = await locator.evaluate((el) => {
    function colorIsVisible(color: string): boolean {
      const t = color.trim().toLowerCase();
      if (!t || t === 'transparent') return false;
      const rgba = t.match(
        /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/,
      );
      if (rgba) {
        const a = rgba[4] !== undefined ? parseFloat(rgba[4]) : 1;
        return a > 0.01;
      }
      return true;
    }

    /** Token focus (#4338ca) en rgb; ignora sombras decorativas (p. ej. shadow-sm). */
    function isFocusAccentColor(color: string): boolean {
      const m = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (m) {
        const [r, g, b] = [m[1], m[2], m[3]].map((n) => parseInt(n, 10));
        return r === 67 && g === 56 && b === 202;
      }
      return color.trim().toLowerCase() === '#4338ca';
    }

    function boxShadowIsVisible(boxShadow: string): boolean {
      if (!boxShadow || boxShadow === 'none') return false;
      const colorRe = /(#[0-9a-f]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\))/i;
      const layers = boxShadow.split(/,(?![^()]*\))/);
      return layers.some((layer) => {
        const t = layer.trim();
        if (!t) return false;
        const colorMatch = t.match(colorRe);
        if (!colorMatch) return false;
        const color = colorMatch[0];
        if (!colorIsVisible(color)) return false;
        const metrics = t.replace(color, '').trim();
        const px = metrics.match(/-?[\d.]+px/g)?.map((v) => parseFloat(v)) ?? [];
        const spread = px.length >= 4 ? Math.abs(px[3]) : 0;
        if (isFocusAccentColor(color) && spread >= 1) return true;
        if (spread >= 2 && (isFocusAccentColor(color) || colorIsVisible(color))) return true;
        return false;
      });
    }

    function outlineIsVisible(s: CSSStyleDeclaration): boolean {
      if (s.outlineStyle === 'none') return false;
      const width = parseFloat(s.outlineWidth);
      if (Number.isNaN(width) || width <= 0) return false;
      return colorIsVisible(s.outlineColor);
    }

    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none')
      return { visible: false, probe: null as null };
    const opacity = parseFloat(s.opacity);
    if (!Number.isNaN(opacity) && opacity <= 0.01) {
      return { visible: false, probe: null as null };
    }
    const visible = outlineIsVisible(s) || boxShadowIsVisible(s.boxShadow);
    return {
      visible,
      probe: {
        outlineStyle: s.outlineStyle,
        outlineWidth: s.outlineWidth,
        outlineColor: s.outlineColor,
        boxShadow: s.boxShadow,
        visibility: s.visibility,
        opacity: s.opacity,
      },
    };
  });

  if (!result.visible) {
    const detail = result.probe
      ? `outlineStyle=${result.probe.outlineStyle}, outlineWidth=${result.probe.outlineWidth}, outlineColor=${result.probe.outlineColor}, boxShadow=${result.probe.boxShadow}`
      : 'elemento no visible';
    expect(result.visible, `Sin indicador de foco visible (${detail})`).toBe(true);
  } else {
    expect(result.visible).toBe(true);
  }
}
