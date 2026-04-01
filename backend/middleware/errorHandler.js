// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
    let error = { ...err };
    error.message = err.message;

    console.error(err);

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = 'Resource not found';
        error = new Error(message);
        error.statusCode = 404;
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const message = 'Duplicate field value entered';
        error = new Error(message);
        error.statusCode = 400;
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message);
        error = new Error(message);
        error.statusCode = 400;
    }

    // Custom Lead Duplicate Handling
    if (err.message === 'DuplicateLeadExists' || err.isDuplicateMerge) {
        return res.status(200).json({
            success: true,
            message: 'Duplicate lead found and merged successfully',
            data: err.mergedLead || null,
            isDuplicate: true
        });
    }

    res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Server Error'
    });
};
