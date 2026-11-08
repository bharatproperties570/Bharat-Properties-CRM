/**
 * brandCanvasEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise Client-Side Visual Engine for Bharat Properties.
 * Automatically composes publication-grade branded marketing creatives
 * with official Navy & Gold palettes, badges, watermarks, price capsules,
 * and regional contact details using HTML5 Canvas.
 * 
 * Zero external API cost · 0ms latency · High-DPI Retina (2x scaling)
 */

export const BRAND_COLORS = {
  navy: '#0B1F3A',
  navyDark: '#06101E',
  gold: '#C9921A',
  goldLight: '#FAD87A',
  goldGradientStart: '#E5B842',
  goldGradientEnd: '#9E6F0E',
  white: '#FFFFFF',
  offWhite: '#F8FAFC',
  textMuted: '#94A3B8'
};

/**
 * Loads an image from a URL or File/Blob safely with CORS support
 * @param {string|File|Blob} src 
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(src) {
  if (!src) {
    return Promise.reject(new Error('Image source is required'));
  }

  // Already loaded Image element or image object
  if ((typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) || (src && typeof src === 'object' && typeof src.width === 'number' && typeof src.height === 'number')) {
    return Promise.resolve(src);
  }

  return new Promise((resolve, reject) => {

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => resolve(img);
    img.onerror = (err) => {
      // If CORS failed on cross-origin image, attempt without crossOrigin as fallback
      if (img.crossOrigin === 'anonymous') {
        const retryImg = new Image();
        retryImg.onload = () => resolve(retryImg);
        retryImg.onerror = (e) => reject(new Error('Failed to load image asset: ' + (e?.message || 'CORS/Network error')));
        retryImg.src = typeof src === 'string' ? src : URL.createObjectURL(src);
      } else {
        reject(new Error('Failed to load image asset'));
      }
    };

    if (typeof src === 'string') {
      img.src = src;
    } else if (src instanceof Blob || src instanceof File) {
      img.src = URL.createObjectURL(src);
    } else {
      reject(new Error('Invalid image source type'));
    }
  });
}

/**
 * Helper to draw rounded rectangle
 */
function roundRect(ctx, x, y, width, height, radius) {
  if (width < 2 * radius) radius = width / 2;
  if (height < 2 * radius) radius = height / 2;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/**
 * Brandifies any raw property photo with Bharat Properties enterprise kit
 * 
 * @param {HTMLImageElement|string|Blob} imageSource 
 * @param {Object} propertyData 
 *   - title: string (e.g. "2BHK Luxury Apartment")
 *   - location: string (e.g. "Sector 7, Kurukshetra")
 *   - price: string (e.g. "₹45 Lakhs")
 *   - phone: string (optional override; auto-defaults by location)
 *   - website: string (optional override)
 *   - rera: string (optional)
 *   - format: '1:1' | '9:16' | '4:5'
 * @returns {Promise<{ dataUrl: string, blob: Blob, width: number, height: number }>}
 */
export async function brandifyPropertyImage(imageSource, propertyData = {}) {
  const img = imageSource instanceof Image ? imageSource : await loadImage(imageSource);

  // Target Dimensions (High DPI 2x for ultra-sharp mobile & feed display)
  const format = propertyData.format || '1:1';
  let targetWidth = 1080;
  let targetHeight = 1080;

  if (format === '9:16') {
    targetWidth = 1080;
    targetHeight = 1920;
  } else if (format === '4:5') {
    targetWidth = 1080;
    targetHeight = 1350;
  }

  // Determine regional phone
  const loc = (propertyData.location || '').toLowerCase();
  const phone = propertyData.phone || (loc.includes('mohali') ? '+91 99910 00570' : '+91 99913 33570');
  const website = propertyData.website || 'www.bharatproperties.co';
  const title = propertyData.title || propertyData.name || propertyData.unitNo || 'Prime Real Estate Opportunity';
  const price = propertyData.price || 'Price on Request';
  const cleanLocation = propertyData.location && !/^[0-9a-fA-F]{24}$/.test(propertyData.location.trim())
    ? propertyData.location.trim()
    : 'Kurukshetra, Haryana';

  // Create high-res canvas
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  // 1. Draw Background Image with Cover Cropping
  const imgRatio = img.width / img.height;
  const targetRatio = targetWidth / targetHeight;
  let sWidth, sHeight, sx, sy;

  if (imgRatio > targetRatio) {
    sHeight = img.height;
    sWidth = img.height * targetRatio;
    sx = (img.width - sWidth) / 2;
    sy = 0;
  } else {
    sWidth = img.width;
    sHeight = img.width / targetRatio;
    sx = 0;
    sy = (img.height - sHeight) / 2;
  }

  ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);

  // 2. Subtle Luxury Border Frame
  ctx.save();
  ctx.strokeStyle = 'rgba(201, 146, 26, 0.4)'; // Gold accent border
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, targetWidth - 14, targetHeight - 14);
  ctx.restore();

  // 3. Top Banner Header (Gradient Vignette)
  const topGradient = ctx.createLinearGradient(0, 0, 0, 220);
  topGradient.addColorStop(0, 'rgba(6, 16, 30, 0.85)');
  topGradient.addColorStop(0.6, 'rgba(11, 31, 58, 0.55)');
  topGradient.addColorStop(1, 'rgba(11, 31, 58, 0)');
  ctx.fillStyle = topGradient;
  ctx.fillRect(0, 0, targetWidth, 220);

  // 3a. Top-Right: Official Bharat Properties Logo & Emblem
  ctx.save();
  // Logo Background Pill
  roundRect(ctx, targetWidth - 360, 36, 324, 76, 12);
  ctx.fillStyle = 'rgba(11, 31, 58, 0.85)';
  ctx.fill();
  ctx.strokeStyle = BRAND_COLORS.gold;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Emblem House Icon in Gold
  ctx.fillStyle = BRAND_COLORS.gold;
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('🏛️', targetWidth - 344, 85);

  // Brand Name
  ctx.fillStyle = BRAND_COLORS.goldLight;
  ctx.font = '800 22px "Montserrat", "Segoe UI", sans-serif';
  ctx.letterSpacing = '1px';
  ctx.fillText('BHARAT', targetWidth - 296, 68);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '600 13px "Montserrat", "Segoe UI", sans-serif';
  ctx.fillText('PROPERTIES', targetWidth - 296, 89);
  ctx.restore();

  // 3b. Top-Left: Property Badge (Verified Title vs Featured)
  const isVerified = Boolean(propertyData.isVerified);
  const badgeText = propertyData.badgeText || (isVerified ? '🛡️ VERIFIED PROPERTY' : '✨ FEATURED PROPERTY');
  ctx.save();
  roundRect(ctx, 36, 36, 260, 58, 10);
  const badgeGrad = ctx.createLinearGradient(36, 36, 296, 94);
  if (isVerified) {
    badgeGrad.addColorStop(0, '#C9921A');
    badgeGrad.addColorStop(1, '#78540B');
  } else {
    badgeGrad.addColorStop(0, '#1E3A8A');
    badgeGrad.addColorStop(1, '#0B1F3A');
  }
  ctx.fillStyle = badgeGrad;
  ctx.fill();
  ctx.strokeStyle = isVerified ? '#FAD87A' : '#93C5FD';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(badgeText, 56, 72);
  ctx.restore();

  // 4. Bottom Lower-Third (Navy Backdrop + Gold Dividers)
  const lowerHeight = format === '9:16' ? 480 : 340;
  const lowerY = targetHeight - lowerHeight;

  const bottomGradient = ctx.createLinearGradient(0, lowerY - 60, 0, targetHeight);
  bottomGradient.addColorStop(0, 'rgba(6, 16, 30, 0)');
  bottomGradient.addColorStop(0.25, 'rgba(6, 16, 30, 0.82)');
  bottomGradient.addColorStop(0.5, 'rgba(11, 31, 58, 0.95)');
  bottomGradient.addColorStop(1, 'rgba(6, 16, 30, 0.98)');
  ctx.fillStyle = bottomGradient;
  ctx.fillRect(0, lowerY - 60, targetWidth, lowerHeight + 60);

  // Gold separator line
  const goldLine = ctx.createLinearGradient(60, lowerY, targetWidth - 60, lowerY);
  goldLine.addColorStop(0, 'rgba(201, 146, 26, 0.1)');
  goldLine.addColorStop(0.5, 'rgba(250, 216, 122, 0.9)');
  goldLine.addColorStop(1, 'rgba(201, 146, 26, 0.1)');
  ctx.strokeStyle = goldLine;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(40, lowerY);
  ctx.lineTo(targetWidth - 40, lowerY);
  ctx.stroke();

  // 4a. Property Title
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 38px "Playfair Display", "Georgia", serif';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

  // Truncate title if too long
  let displayTitle = title;
  if (ctx.measureText(displayTitle).width > targetWidth - 100) {
    while (ctx.measureText(displayTitle + '...').width > targetWidth - 100 && displayTitle.length > 10) {
      displayTitle = displayTitle.substring(0, displayTitle.length - 1);
    }
    displayTitle += '...';
  }
  ctx.fillText(displayTitle, 46, lowerY + 65);
  ctx.restore();

  // 4b. Location with Geo-Pin
  ctx.save();
  ctx.fillStyle = BRAND_COLORS.goldLight;
  ctx.font = '600 24px "Montserrat", sans-serif';
  ctx.fillText(`📍 ${cleanLocation}`, 46, lowerY + 115);
  ctx.restore();

  // 4c. Highlighted Gold Price Pill
  ctx.save();
  const pricePillY = lowerY + 148;
  const priceText = `💰 ${price}`;
  ctx.font = '900 26px "Montserrat", sans-serif';
  const priceWidth = ctx.measureText(priceText).width + 48;

  // Draw Gold Pill Capsule
  roundRect(ctx, 46, pricePillY, priceWidth, 54, 12);
  const pillGradient = ctx.createLinearGradient(46, pricePillY, 46 + priceWidth, pricePillY);
  pillGradient.addColorStop(0, '#E5B842');
  pillGradient.addColorStop(1, '#C9921A');
  ctx.fillStyle = pillGradient;
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Price Text
  ctx.fillStyle = '#06101E';
  ctx.fillText(priceText, 70, pricePillY + 37);
  ctx.restore();

  // 4d. Bottom Action Bar (Phone + Website)
  const footerY = targetHeight - 36;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, footerY - 45);
  ctx.lineTo(targetWidth - 40, footerY - 45);
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 22px "Montserrat", sans-serif';
  ctx.fillText(`📞 CALL / WHATSAPP: ${phone}`, 46, footerY - 14);

  ctx.fillStyle = BRAND_COLORS.goldLight;
  ctx.font = '600 20px "Montserrat", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(website, targetWidth - 46, footerY - 14);
  ctx.restore();

  // 5. Export high-res DataURL and Blob
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
  });

  return {
    dataUrl,
    blob,
    width: targetWidth,
    height: targetHeight
  };
}
