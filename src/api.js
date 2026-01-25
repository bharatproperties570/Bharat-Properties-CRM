import axios from "axios";
const instance = axios.create({
    // baseURL: 'http://localhost:5000/'
    baseURL: 'https://newapi.bharatproperties.co/'
});
export default instance;