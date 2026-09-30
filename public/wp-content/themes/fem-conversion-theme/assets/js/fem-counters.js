console.log("FEM counters cargado ✅ (con infinito animado)");
document.addEventListener("DOMContentLoaded", function () {
  const counters = document.querySelectorAll(".fem-count");
  if (!counters.length) return;
  
  const prefersReduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  
  // Variable global para controlar cuándo terminan todos los counters
  let allCountersFinished = false;
  let activeCounters = 0;
  
  function formatNumber(value) {
    try {
      return new Intl.NumberFormat("es-ES").format(value);
    } catch (e) {
      return String(Math.round(value));
    }
  }
  
function setFinal(el) {
  const target = el.dataset.target;
  const prefix = el.dataset.prefix || "";  // ← Prefix
  const suffix = el.dataset.suffix || "";  // ← Suffix
  
  if (target === "infinity" || target === "∞") {
    el.textContent = prefix + "∞" + suffix;
  } else {
    el.textContent = prefix + formatNumber(Number(target)) + suffix;
  }
}
  
  /**
   * Anima el infinito mostrando números aleatorios
   */
  function animateInfinity(el) {
    if (el.dataset.animated === "1") return;
    el.dataset.animated = "1";
    
    const suffix = el.dataset.suffix || "";
    const minRange = Number(el.dataset.minRange || "1000");
    const maxRange = Number(el.dataset.maxRange || "9999");
    const changeSpeed = Number(el.dataset.changeSpeed || "50"); // ms entre cambios
    
    if (prefersReduced) {
      setFinal(el);
      return;
    }
    
    let intervalId;
    
    function updateRandom() {
      // Si todos los counters terminaron, mostrar ∞ y parar
      if (allCountersFinished) {
        clearInterval(intervalId);
        setFinal(el);
        return;
      }
      
      // Generar número aleatorio en el rango
      const randomNum = Math.floor(Math.random() * (maxRange - minRange + 1)) + minRange;
      el.textContent = formatNumber(randomNum) + suffix;
    }
    
    // Iniciar animación de números aleatorios
    intervalId = setInterval(updateRandom, changeSpeed);
    updateRandom(); // Primera ejecución inmediata
  }
  
  /**
   * Anima un counter normal
   */
  function animateCounter(el) {
    if (el.dataset.animated === "1") return;
    
    const target = el.dataset.target;
    
    // Si es infinito, usar animación especial
    if (target === "infinity" || target === "∞") {
      animateInfinity(el);
      return;
    }
    
    const targetNum = Number(target || "0");
    if (!isFinite(targetNum)) return;
    
    el.dataset.animated = "1";
    activeCounters++;
    
    if (prefersReduced) {
      setFinal(el);
      activeCounters--;
      if (activeCounters === 0) allCountersFinished = true;
      return;
    }
    
    const suffix = el.dataset.suffix || "";
    const duration = 1200;
    const start = performance.now();
    
    
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = targetNum * eased;
      

      
      // Usar Math.floor para que NUNCA exceda el target
      const safeValue = Math.floor(current);
      const displayValue = Math.min(safeValue, targetNum);
      
   
          const prefix = el.dataset.prefix || "";
        const suffix = el.dataset.suffix || "";
  el.textContent = prefix + formatNumber(displayValue) + suffix;
   
      el.textContent = formatNumber(displayValue) + suffix;
      
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        // Asegurar valor final exacto
        setFinal(el);
        
        // Marcar como terminado
        activeCounters--;
        if (activeCounters === 0) {
          allCountersFinished = true;
        }
      }
    }
    
    requestAnimationFrame(tick);
  }
  
  // Fallback si el navegador / entorno rompe IntersectionObserver
  if (!("IntersectionObserver" in window)) {
    counters.forEach(animateCounter);
    return;
  }
  
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) animateCounter(entry.target);
      });
    },
    { threshold: 0.35 }
  );
  
  counters.forEach((el) => io.observe(el));
});