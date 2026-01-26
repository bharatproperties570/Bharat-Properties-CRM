import axios from "axios";
const instance=axios.create({
   
          baseURL:'https://newapi.bharatproperties.co/'
        // baseURL:'http://localhost:5000/'
  


       
})
export default instance;