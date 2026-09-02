import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './HeroSlideshow.css';
import { scrollToSection } from '../../utils/scrollToSection';

const slideImages = [
  '/images/nature_img1.jpeg',
  '/images/nature_img2.jpg',
  '/images/nature_img3.jpg',
  '/images/nature_img4.jpg',
  '/images/nature_img5.jpg',
  '/images/nature_img6.jpg',
];

const slideKeys = [
  'hero.slide1',
  'hero.slide2',
  'hero.slide3',
  'hero.slide4',
  'hero.slide5',
  'hero.slide6',
];

function HeroSlideshow() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slideImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const goTo = (index) => setCurrent(index);
  const goPrev = () => setCurrent((prev) => (prev - 1 + slideImages.length) % slideImages.length);
  const goNext = () => setCurrent((prev) => (prev + 1) % slideImages.length);

  return (
    <div className="hero-slideshow">
      {slideImages.map((image, index) => (
        <div
          key={index}
          className={`hero-slide ${index === current ? 'active' : ''}`}
          style={{ backgroundImage: `url(${image})` }}
        >
          <div className="hero-overlay">
            <h1 className="hero-title">{t(slideKeys[index])}</h1>
            <button className="hero-cta" onClick={() => scrollToSection('heatmap')}>
              {t('hero.cta')}
            </button>
          </div>
        </div>
      ))}

      <button className="hero-arrow hero-arrow-left" onClick={goPrev} aria-label="Previous slide">
        <span className="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <button className="hero-arrow hero-arrow-right" onClick={goNext} aria-label="Next slide">
        <span className="material-symbols-outlined">arrow_forward_ios</span>
      </button>

      <div className="hero-dots">
        {slideImages.map((_, index) => (
          <button
            key={index}
            className={`hero-dot ${index === current ? 'active' : ''}`}
            onClick={() => goTo(index)}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

export default HeroSlideshow;