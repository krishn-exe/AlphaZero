import './howItWorks.css';

function HowItWorks() {
    return(
        <div className='papa-container'>
            <div className='top'>
                <img src='/info-icons/user-manual.png' className='imgHow'/>
                <div>How It Works</div>
            </div>
            <hr/>
            <div className='bottom'>
                <div className='block'>
                    <img src='/info-icons/map-1.png' className='imgHow'/>
                    <div className='blocktext'>We monitor your region 24/7</div>
                    <div className='inlinetext'>Rainfall, slope data, and satellite/sensor inputs are tracked continuously across NER districts.</div>
                </div>
                <img src='/info-icons/arrow.png' className='arrow' />
                <div className='block'>
                    <img src='/info-icons/machine-learning.png' className='imgHow'/>
                    <div className='blocktext'>AI predicts risk in realtime</div>
                    <div className='inlinetext'>Our model scores landslide risk (low/moderate/high) and updates the heatmap live</div>
                </div>
                <img src='/info-icons/arrow.png' className='arrow' />
                <div className='block'>
                    <img src='/info-icons/alarm.png' className='imgHow'/>
                    <div className='blocktext'>You get alerted before it happens</div>
                    <div className='inlinetext'>If your area crosses into high risk, you get an instant SMS/email warning — not after the fact.</div>
                </div>
                <img src='/info-icons/arrow.png' className='arrow' />
                <div className='block'>
                    <img src='/info-icons/report-1.png' className='imgHow'/>
                    <div className='blocktext'>You can report what you see</div>
                    <div className='inlinetext'>Spot a landslide, blocked road, or hazard? Report it in seconds to help authorities respond faster.</div>
                </div>
                
            </div>
        </div>
    )
}

export default HowItWorks;