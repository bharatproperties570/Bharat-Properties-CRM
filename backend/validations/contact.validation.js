import Joi from "joi";

export const createContactSchema = Joi.object({
    title: Joi.string().optional().allow(null, ""),
    name: Joi.string().required().messages({
        "string.empty": "First name is required",
        "any.required": "First name is required"
    }),
    surname: Joi.string().optional().allow("", null),
    fatherName: Joi.string().optional().allow("", null),
    countryCode: Joi.string().optional().allow(null, ""),
    phones: Joi.array().items(
        Joi.object({
            _id: Joi.string().optional(),
            number: Joi.string().pattern(/^[0-9+\-\s()]+$/).required().messages({
                "string.pattern.base": "Phone number must contain only numbers and +, -, space, or parentheses",
                "any.required": "Phone number is required"
            }),
            type: Joi.string().default("Personal")
        })
    ).min(1).required().messages({
        "array.min": "At least one phone number is required",
        "any.required": "Phone number is required"
    }),
    emails: Joi.array().items(
        Joi.object({
            _id: Joi.string().optional(),
            address: Joi.string().email().allow("", null),
            type: Joi.string().default("Personal")
        })
    ).optional(),

    tags: Joi.array().items(Joi.string()).optional(),
    description: Joi.string().optional().allow("", null),

    // Professional Details
    professionCategory: Joi.string().optional().allow(null, ""),
    professionSubCategory: Joi.string().optional().allow(null, ""),
    designation: Joi.string().optional().allow(null, ""),
    company: Joi.string().optional().allow("", null),
    workOffice: Joi.string().optional().allow("", null),

    // System Details
    source: Joi.string().optional().allow(null, ""),
    subSource: Joi.string().optional().allow(null, ""),
    campaign: Joi.string().optional().allow("", null),
    team: Joi.string().optional().allow("", null),
    owner: Joi.string().optional().allow(null, ""),
    visibleTo: Joi.string().optional().allow("", null),

    // Personal Address
    personalAddress: Joi.object({
        _id: Joi.string().optional(),
        hNo: Joi.string().optional().allow("", null),
        street: Joi.string().optional().allow("", null),
        country: Joi.string().hex().length(24).optional().allow(null, ""),
        state: Joi.string().hex().length(24).optional().allow(null, ""),
        city: Joi.string().hex().length(24).optional().allow(null, ""),
        tehsil: Joi.string().hex().length(24).optional().allow(null, ""),
        postOffice: Joi.string().hex().length(24).optional().allow(null, ""),
        pinCode: Joi.string().optional().allow("", null),
        location: Joi.string().hex().length(24).optional().allow(null, ""),
        area: Joi.string().optional().allow("", null),
    }).optional(),

    // Correspondence Address
    correspondenceAddress: Joi.object({
        _id: Joi.string().optional(),
        hNo: Joi.string().optional().allow("", null),
        street: Joi.string().optional().allow("", null),
        country: Joi.string().hex().length(24).optional().allow(null, ""),
        state: Joi.string().hex().length(24).optional().allow(null, ""),
        city: Joi.string().hex().length(24).optional().allow(null, ""),
        tehsil: Joi.string().hex().length(24).optional().allow(null, ""),
        postOffice: Joi.string().hex().length(24).optional().allow(null, ""),
        pinCode: Joi.string().optional().allow("", null),
        location: Joi.string().hex().length(24).optional().allow(null, ""),
        area: Joi.string().optional().allow("", null),
    }).optional(),

    // Other Details
    gender: Joi.string().optional().allow("", null),
    maritalStatus: Joi.string().optional().allow("", null),
    birthDate: Joi.date().optional().allow(null, ""),
    anniversaryDate: Joi.date().optional().allow(null, ""),

    // Education
    educations: Joi.array().items(
        Joi.object({
            _id: Joi.string().optional(),
            education: Joi.string().hex().length(24).optional().allow(null, ""),
            degree: Joi.string().hex().length(24).optional().allow(null, ""),
            school: Joi.string().optional().allow("", null)
        })
    ).optional(),

    // Loans
    loans: Joi.array().items(
        Joi.object({
            _id: Joi.string().optional(),
            loanType: Joi.string().hex().length(24).optional().allow(null, ""),
            bank: Joi.string().hex().length(24).optional().allow(null, ""),
            loanAmount: Joi.string().optional().allow("", null)
        })
    ).optional(),

    // Social Media
    socialMedia: Joi.array().items(
        Joi.object({
            _id: Joi.string().optional(),
            platform: Joi.string().hex().length(24).optional().allow(null, ""),
            url: Joi.string().optional().allow("", null)
        })
    ).optional(),

    // Incomes
    incomes: Joi.array().items(
        Joi.object({
            _id: Joi.string().optional(),
            incomeType: Joi.string().hex().length(24).optional().allow(null, ""),
            amount: Joi.string().optional().allow("", null)
        })
    ).optional(),

    // Documents
    documents: Joi.array().items(
        Joi.object({
            _id: Joi.string().optional(),
            documentName: Joi.string().hex().length(24).optional().allow(null, ""), // Category
            documentType: Joi.string().hex().length(24).optional().allow(null, ""),
            documentNo: Joi.string().optional().allow("", null),
            projectName: Joi.string().optional().allow("", null),
            block: Joi.string().optional().allow("", null),
            unitNumber: Joi.string().optional().allow("", null),
            documentPicture: Joi.string().optional().allow("", null)
        })
    ).optional(),

    // Legacy/Additional
    stage: Joi.string().optional().allow("", null).default("New"),
    status: Joi.string().optional().allow("", null).default("Active"),
    addOn: Joi.array().items(Joi.string()).optional(),
    groups: Joi.array().items(Joi.string()).optional(),
    isActionable: Joi.boolean().default(false),
    requirement: Joi.string().optional().allow(null, ""),
    budget: Joi.string().optional().allow(null, ""),
    location: Joi.string().optional().allow(null, ""),
});

export const updateContactSchema = createContactSchema.fork(
    Object.keys(createContactSchema.describe().keys),
    (schema) => schema.optional()
);
