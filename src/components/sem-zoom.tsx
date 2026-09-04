"use client";

import { useEffect } from "react";

// Trava o zoom da página (pinça e toque duplo) nos apps de celular. O Safari do
// iPhone ignora o "user-scalable=no" do viewport, então também bloqueia os
// gestos e usa touch-action (pan-x pan-y = só rolagem).
export function SemZoom() {
  useEffect(() => {
    const html = document.documentElement;
    const antesHtml = html.style.touchAction;
    const antesBody = document.body.style.touchAction;
    html.style.touchAction = "pan-x pan-y";
    document.body.style.touchAction = "pan-x pan-y";

    const bloqueia = (e: Event) => e.preventDefault();
    // pinça (Safari dispara gesturestart/gesturechange)
    document.addEventListener("gesturestart", bloqueia, { passive: false });
    document.addEventListener("gesturechange", bloqueia, { passive: false });
    // dois dedos no touchmove = pinça em outros navegadores
    const move = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    document.addEventListener("touchmove", move, { passive: false });
    // toque duplo
    let ultimo = 0;
    const fim = (e: TouchEvent) => {
      const agora = new Date().getTime();
      if (agora - ultimo < 300) e.preventDefault();
      ultimo = agora;
    };
    document.addEventListener("touchend", fim, { passive: false });

    return () => {
      html.style.touchAction = antesHtml;
      document.body.style.touchAction = antesBody;
      document.removeEventListener("gesturestart", bloqueia);
      document.removeEventListener("gesturechange", bloqueia);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", fim);
    };
  }, []);
  return null;
}
