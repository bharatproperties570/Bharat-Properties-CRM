import axios from 'axios';
axios.get('http://localhost:5000/api/lookups?lookup_type=WaterSource,WaterLevel').then(r => console.log(r.data)).catch(e => console.log(e.message));
