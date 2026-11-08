import { describe, it, expect, vi } from 'vitest';
import { BRAND_COLORS, brandifyPropertyImage } from '../brandCanvasEngine';

describe('brandCanvasEngine — Enterprise Visual Engine', () => {
  it('exports correct official brand palette colors', () => {
    expect(BRAND_COLORS.navy).toBe('#0B1F3A');
    expect(BRAND_COLORS.gold).toBe('#C9921A');
    expect(BRAND_COLORS.goldLight).toBe('#FAD87A');
    expect(BRAND_COLORS.white).toBe('#FFFFFF');
  });

  it('rejects image generation when image source is missing', async () => {
    await expect(brandifyPropertyImage(null, {})).rejects.toThrow('Image source is required');
  });

  it('correctly uses verified badge vs featured badge based on isVerified option', async () => {
    // Mock HTML5 Canvas context
    const mockContext = {
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arcTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 120 }),
      createLinearGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn()
      })
    };

    const mockCanvas = {
      width: 1080,
      height: 1080,
      getContext: vi.fn().mockReturnValue(mockContext),
      toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,mocked_canvas_data'),
      toBlob: vi.fn((cb) => cb(new Blob(['mocked'], { type: 'image/jpeg' })))
    };

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') return mockCanvas;
      return originalCreateElement(tag);
    });

    const mockImage = {
      width: 800,
      height: 600
    };

    // 1. Test with verified property
    const verifiedResult = await brandifyPropertyImage(mockImage, {
      title: 'Royal Palms Villa',
      location: 'Sector 32, Kurukshetra',
      price: '₹ 2.5 Cr',
      isVerified: true
    });

    expect(verifiedResult.dataUrl).toBe('data:image/jpeg;base64,mocked_canvas_data');
    expect(mockContext.fillText).toHaveBeenCalledWith('🛡️ VERIFIED PROPERTY', 56, 72);

    // 2. Test with unverified / featured property
    mockContext.fillText.mockClear();
    const featuredResult = await brandifyPropertyImage(mockImage, {
      title: 'Standard Plot',
      location: 'Sector 7, Kurukshetra',
      price: '₹ 60 Lakh',
      isVerified: false
    });

    expect(featuredResult.dataUrl).toBe('data:image/jpeg;base64,mocked_canvas_data');
    expect(mockContext.fillText).toHaveBeenCalledWith('✨ FEATURED PROPERTY', 56, 72);

    vi.restoreAllMocks();
  });
});
