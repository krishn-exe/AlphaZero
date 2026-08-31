// utils/scrollToSection.js
export function scrollToSection(sectionId, navigate, location) {
  if (location.pathname !== '/') {
    navigate('/');
    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  } else {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
  }
}