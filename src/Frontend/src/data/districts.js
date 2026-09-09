// PLACEHOLDER DATA — replace with the full ~130-district list from backend.
// Grouped by state so it can render as <optgroup> in dropdowns.
// Shared across ReportIncident, SubscribeAlert, and the feed's district search
// so there's a single source of truth for district names.

export const NER_DISTRICTS = [
  {
    state: 'Assam',
    districts: [
      'Kamrup Metropolitan',
      'Kamrup Rural',
      'Nagaon',
      'Dibrugarh',
      'Jorhat',
      'Cachar',
    ],
  },
  {
    state: 'Arunachal Pradesh',
    districts: [
      'Papum Pare',
      'West Kameng',
      'East Siang',
      'Tawang',
    ],
  },
  {
    state: 'Manipur',
    districts: [
      'Imphal West',
      'Imphal East',
      'Churachandpur',
    ],
  },
  {
    state: 'Meghalaya',
    districts: [
      'East Khasi Hills',
      'West Khasi Hills',
      'Ri Bhoi',
    ],
  },
  {
    state: 'Mizoram',
    districts: [
      'Aizawl',
      'Lunglei',
    ],
  },
  {
    state: 'Nagaland',
    districts: [
      'Kohima',
      'Dimapur',
    ],
  },
  {
    state: 'Sikkim',
    districts: [
      'East Sikkim',
      'West Sikkim',
      'South Sikkim',
      'North Sikkim',
    ],
  },
  {
    state: 'Tripura',
    districts: [
      'West Tripura',
      'Gomati',
      'Dhalai',
    ],
  },
];

// Flat list, useful for the feed's search/filter logic
export const NER_DISTRICTS_FLAT = NER_DISTRICTS.flatMap((s) => s.districts);