import './infoMax.css';

function InfoMax() {

    return (
        <div className='entireBlock'>
            <div className='block'>
                <div className='box'>
                  <img src='/info-icons/location.png' className='iconsmx'/>
                  <div className='text1'>78</div>
                </div>
                <div className='second'>
                    <div className='text'>Monitored Location</div>
                </div>
            </div>

            <div className='block'>
                <div className='box'>
                  <img src='/info-icons/warning.png' className='iconsmx'/>
                  <div className='text1'>26</div>
                </div>
                <div className='second'>
                    <div className='text'>High Risk Locations</div>
                </div>
            </div>

            <div className='block'>
                <div className='box'>
                  <img src='/info-icons/time-left.png' className='iconsmx'/>
                  <div className='text1'>24/7</div>
                </div>
                <div className='second'>
                    <div className='text'>Continuous Monitoring</div>               
                </div>  
            </div>

            <div className='block'>
                <div className='box'>
                  <img src='/info-icons/chart.png' className='iconsmx'/>
                  <div  className='text1'>99%</div>
                </div>
                <div className='second'>
                    <div  className='text'>Prediction Accuracy</div>                  
                </div>
            </div>

        </div>
    )

}

export default InfoMax;