import { expect, type Locator } from '@playwright/test';

/** Lógica duplicada en el browser vía evaluate (sin imports en página). */
export async function expectVisibleFocusIndicator(locator: Locator) {
  const result = await locator.evaluate((el) => {
    const COLOR_FRAGMENT =
      /((?:oklch|oklab|lab|lch)\([^)]+\)|#[0-9a-f]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\))/i;

    function colorIsVisible(color: string): boolean {
      const t = color.trim().toLowerCase();
      if (!t || t === 'transparent' || t === 'none') return false;

      const slashAlpha = t.match(/\/\s*([\d.]+%?)\s*\)$/);
      if (slashAlpha) {
        const raw = slashAlpha[1];
        if (raw.endsWith('%')) return parseFloat(raw) > 1;
        return parseFloat(raw) > 0.01;
      }

      const rgba = t.match(
        /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/,
      );
      if (rgba) {
        const a = rgba[4] !== undefined ? parseFloat(rgba[4]) : 1;
        return a > 0.01;
      }

      const hsla = t.match(/hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(?:,\s*([\d.]+))?\s*\)/);
      if (hsla && hsla[1] !== undefined) return parseFloat(hsla[1]) > 0.01;

      return true;
    }

    /**
     * Anillo focus via box-shadow (WCAG 2.4.7): sin blur, spread positivo ≥ 1px,
     * color visible (cualquier color). Excluye elevaciones (shadow-sm/md: blur > 0).
     */
    function boxShadowIsFocusRing(boxShadow: string): boolean {
      if (!boxShadow || boxShadow === 'none') return false;
      const layers = boxShadow.split(/,(?![^()]*\))/);
      return layers.some((layer) => {
        let t = layer.trim();
        if (!t) return false;
        t = t.replace(/^inset\s+/i, '');
        const colorMatch = t.match(COLOR_FRAGMENT);
        if (!colorMatch) return false;
        const color = colorMatch[0];
        if (!colorIsVisible(color)) return false;

        const metrics = t.replace(color, '').trim();
        const px = metrics.match(/-?[\d.]+px/g)?.map((v) => parseFloat(v)) ?? [];
        if (px.length < 4) return false;

        const blur = px[2];
        const spread = px[3];
        if (Math.abs(blur) > 0.01) return false;
        if (spread < 1) return false;

        return true;
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
    const visible = outlineIsVisible(s) || boxShadowIsFocusRing(s.boxShadow);
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
