import fs from "fs";

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
    const errorLog = `[${new Date().toISOString()}] ${req.method} ${req.url}\nError: ${err.message}\nStack: ${err.stack}\n\n`;
    fs.appendFileSync("/tmp/crm_crash.log", errorLog);
    
    console.error("Error Stack:", err.stack);

    const statusCode = err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(statusCode).json({
        success: false,
        message: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

export class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}
