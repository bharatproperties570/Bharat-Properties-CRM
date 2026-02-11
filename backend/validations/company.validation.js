import Joi from "joi";

const addressSchema = Joi.object({
    branchName: Joi.string().optional().allow("", null),
    hNo: Joi.string().optional().allow("", null),
    street: Joi.string().optional().allow("", null),
    city: Joi.string().hex().length(24).optional().allow(null, ""),
    state: Joi.string().hex().length(24).optional().allow(null, ""),
    tehsil: Joi.string().hex().length(24).optional().allow(null, ""),
    postOffice: Joi.string().hex().length(24).optional().allow(null, ""),
    pinCode: Joi.string().optional().allow("", null),
    area: Joi.string().optional().allow("", null),
    location: Joi.string().hex().length(24).optional().allow(null, ""),
    country: Joi.string().hex().length(24).optional().allow(null, "")
});

export const createCompanySchema = Joi.object({
    name: Joi.string().required().messages({
        "string.empty": "Company name is required",
        "any.required": "Company name is required"
    }),
    phones: Joi.array().items(
        Joi.object({
            phoneCode: Joi.string().default("+91"),
            phoneNumber: Joi.string().pattern(/^[0-9+\-\s()]+$/).allow("", null),
            type: Joi.string().default("Work")
        })
    ).optional(),
    emails: Joi.array().items(
        Joi.object({
            address: Joi.string().email().allow("", null),
            type: Joi.string().default("Work")
        })
    ).optional(),
    companyType: Joi.string().hex().length(24).optional().allow(null, ""),
    industry: Joi.string().hex().length(24).optional().allow(null, ""),
    description: Joi.string().optional().allow("", null),
    gstNumber: Joi.string().optional().allow("", null),
    campaign: Joi.string().optional().allow("", null),
    source: Joi.string().hex().length(24).optional().allow(null, ""),
    subSource: Joi.string().hex().length(24).optional().allow(null, ""),
    team: Joi.string().default("Sales"),
    owner: Joi.string().hex().length(24).optional().allow(null, ""),
    visibleTo: Joi.string().default("Everyone"),
    addresses: Joi.object({
        registeredOffice: addressSchema.optional(),
        branchOffice: Joi.array().items(addressSchema).optional(),
        corporateOffice: addressSchema.optional(),
        headOffice: addressSchema.optional(),
        siteOffice: Joi.array().items(addressSchema).optional()
    }).optional(),
    employees: Joi.array().items(Joi.string().hex().length(24)).optional().allow(null)
});

export const updateCompanySchema = createCompanySchema.fork(
    Object.keys(createCompanySchema.describe().keys),
    (schema) => schema.optional()
);
