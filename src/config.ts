export const CONFIG = {
  
  mandalaRadiusPerPalm: 1.35,
  
  maxRadiusFrac: 0.42,
  
  mandalaMargin: 1.35,
  bloom: { strength: 0.58, radius: 0.5, threshold: 0.82 },
  videoBrightness: 0.8,
  vignette: 0.55,
  grain: 0.03,
  particles: { max: 6000 },
  trail: { life: 1.0, points: 56 },
  
  loop: { minRadius: 42, minSweep: 0.92, maxCv: 0.4, window: 3.0, life: 4.5 },
  // আঙুলে আঁকা আকৃতি: minLen = পর্দার ছোট দিকের ভগ্নাংশ, pause = থামলে দাগ শেষ ধরার সময় (সেকেন্ড)
  shape: { minLen: 0.12, minPts: 8, cooldown: 0.5, minScore: 0.6 },
  
  maxPixelRatio: 2,
  mobileMaxPixelRatio: 1.75,
};
