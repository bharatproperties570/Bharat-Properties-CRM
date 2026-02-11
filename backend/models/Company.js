import mongoose from "mongoose";
import mongoosePaginate from 'mongoose-paginate-v2';

const AddressSchema = new mongoose.Schema({
    branchName: String,
    hNo: String,
    street: String,
    city: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    state: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    tehsil: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    postOffice: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    pinCode: String,
    area: String,
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    country: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' }
}, { _id: false });

const CompanySchema = new mongoose.Schema({
    name: { type: String, required: true },
    phones: [{
        phoneCode: { type: String, default: "+91" },
        phoneNumber: String,
        type: { type: String, default: "Work" }
    }],
    emails: [{
        address: String,
        type: { type: String, default: "Work" }
    }],
    companyType: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    industry: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    description: String,
    gstNumber: String,
    campaign: String,
    source: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    subSource: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup' },
    team: { type: String, default: "Sales" },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    visibleTo: { type: String, default: "Everyone" },
    addresses: {
        registeredOffice: AddressSchema,
        branchOffice: [AddressSchema],
        corporateOffice: AddressSchema,
        headOffice: AddressSchema,
        siteOffice: [AddressSchema]
    },
    employees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }]
}, { timestamps: true });

CompanySchema.plugin(mongoosePaginate);

export default mongoose.model("Company", CompanySchema);
