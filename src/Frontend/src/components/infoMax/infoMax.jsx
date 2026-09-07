import { useTranslation } from 'react-i18next';
import './infoMax.css';

function InfoMax() {
  const { t } = useTranslation();

  const stats = [
    { icon: 'location.png', value: '78', labelKey: 'infoMax.monitoredLocations' },
    { icon: 'warning.png', value: '26', labelKey: 'infoMax.highRiskLocations' },
    { icon: 'time-left.png', value: '24/7', labelKey: 'infoMax.continuousMonitoring' },
    { icon: 'chart.png', value: '97%', labelKey: 'infoMax.predictionAccuracy' },
  ];

  return (
    <div className='entireBlock'>
      {stats.map((stat) => (
        <div className='block' key={stat.labelKey}>
          <div className='box'>
            <img src={`/info-icons/${stat.icon}`} className='iconsmx' />
            <div className='text1'>{stat.value}</div>
          </div>
          <div className='second'>
            <div className='text'>{t(stat.labelKey)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default InfoMax;