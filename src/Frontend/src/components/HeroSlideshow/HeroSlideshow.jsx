import { useState, useEffect } from 'react';
import './HeroSlideshow.css';
import { scrollToSection } from '../../utils/scrollToSection';

const slides = [
  {
    image: '/images/nature_img1.jpeg',
    title: 'AI-Based Early Warning and Landslide Risk Monitoring System in NER',
  },
  {
    image: '/images/nature_img2.jpg',
    title: 'Built for every community — in your language'
  },
  {
    image: '/images/nature_img3.jpg',
    title: '24/7 continuous monitoring, powered by AI',
  },
   { image: '/images/nature_img4.jpg',
     title: 'See something risky? Report it instantly.' 
    },
  { image: '/images/nature_img5.jpg',
     title: 'Real-time risk monitoring across the North Eastern Region',
    
     },
  { image: '/images/nature_img6.jpg',
     title: 'Real-time control for authorities and responders'
     },

];

function HeroSlideshow() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 5000); // change slide every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const goTo = (index) => setCurrent(index);
  const goPrev = () => setCurrent((prev) => (prev - 1 + slides.length) % slides.length);
  const goNext = () => setCurrent((prev) => (prev + 1) % slides.length);

  return (
    <div className="hero-slideshow">
      {slides.map((slide, index) => (
        <div
          key={index}
          className={`hero-slide ${index === current ? 'active' : ''}`}
          style={{ backgroundImage: `url(${slide.image})` }}
        >
          <div className="hero-overlay">
            <h1 className="hero-title">{slide.title}</h1>
<button className="hero-cta" onClick={() => scrollToSection('heatmap')}>
  Explore Live heatmap
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
        {slides.map((_, index) => (
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