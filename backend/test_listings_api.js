import axios from 'axios';

async function test() {
    try {
        const res = await axios.get('http://localhost:4000/api/public/listings', {
            headers: {
                'X-API-KEY': 'BP-WEB-INTEGRATION-2026-X7Y9'
            }
        });
        console.log("STATUS:", res.status);
        console.log("COUNT:", res.data.count);
        if (res.data.data && res.data.data.length > 0) {
            console.log("FIRST LISTING:", JSON.stringify(res.data.data[0], null, 2));
            console.log("LISTINGS METADATA:", res.data.data.map(d => ({
                id: d._id,
                projectName: d.projectName,
                unitNo: d.unitNo,
                images: d.images,
                imagesDetail: d.imagesDetail,
                websiteMetadata: d.websiteMetadata
            })));
        }
    } catch (err) {
        console.error(err.message);
    }
}
test();
