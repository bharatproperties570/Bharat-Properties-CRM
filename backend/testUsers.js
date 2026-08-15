import connectDB from "./src/config/db.js";
import { getUsers } from "./controllers/user.controller.js";

async function run() {
    await connectDB();
    const req = {
        query: {}
    };
    const res = {
        status: (code) => ({
            json: (data) => {
                console.log("STATUS:", code);
                console.log("RESPONSE:", JSON.stringify(data, null, 2));
            }
        })
    };
    await getUsers(req, res);
    process.exit(0);
}
run().catch(console.error);
