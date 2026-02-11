import Joi from 'joi';

const schema = Joi.string().hex().length(24).optional().allow(null, "");

const test1 = schema.validate("");
console.log("Empty string:", test1.error ? test1.error.message : "Success");

const test2 = schema.validate(null);
console.log("Null:", test2.error ? test2.error.message : "Success");

const test3 = schema.validate("invalid");
console.log("Invalid string:", test3.error ? test3.error.message : "Success");

const test4 = schema.validate("507f1f77bcf86cd799439011");
console.log("Valid Hex:", test4.error ? test4.error.message : "Success");
