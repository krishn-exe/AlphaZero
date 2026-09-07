import { useTranslation } from 'react-i18next';
import './howItWorks.css';

function HowItWorks() {
  const { t } = useTranslation();

  const steps = [
    { icon: 'map-1.png', titleKey: 'howItWorks.step1Title', textKey: 'howItWorks.step1Text' },
    { icon: 'machine-learning.png', titleKey: 'howItWorks.step2Title', textKey: 'howItWorks.step2Text' },
    { icon: 'alarm.png', titleKey: 'howItWorks.step3Title', textKey: 'howItWorks.step3Text' },
    { icon: 'report-1.png', titleKey: 'howItWorks.step4Title', textKey: 'howItWorks.step4Text' },
  ];

  return (
    <div   id='about' className='papa-container'>
      <div className='top'>
        <img src='/info-icons/user-manual.png' className='imgHow' />
        <div>{t('howItWorks.title')}</div>
      </div>
      <hr />
      <div className='bottom'>
        {steps.map((step, i) => (
          <div key={step.titleKey} style={{ display: 'contents' }}>
            <div className='block'>
              <img src={`/info-icons/${step.icon}`} className='imgHow' />
              <div className='blocktext'>{t(step.titleKey)}</div>
              <div className='inlinetext'>{t(step.textKey)}</div>
            </div>
            {i < steps.length - 1 && <img src='/info-icons/arrow.png' className='arrow' />}
          </div>
        ))}
      </div>
    </div>
  );
}

export default HowItWorks;