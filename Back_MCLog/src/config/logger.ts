import winston from "winston";

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            filename: "logs/app.log",
            maxsize: 10 * 1024 * 1024,
            maxFiles: 5,
            tailable: true,
        }),
    ],
});

export default logger;
