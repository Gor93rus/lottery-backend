import Joi from "joi";
import { Request, Response, NextFunction } from "express";

/**
 * Validation schemas for ticket purchases
 */

// Numbers array validation (5 unique numbers between 1-36)
const numbersArraySchema = Joi.array()
  .items(Joi.number().integer().min(1).max(36))
  .length(5)
  .unique()
  .required()
  .messages({
    "array.base": "Numbers must be an array",
    "array.length": "Must select exactly 5 numbers",
    "array.unique": "Numbers must be unique",
    "number.min": "Numbers must be between 1 and 36",
    "number.max": "Numbers must be between 1 and 36",
    "any.required": "Numbers are required",
  });

// Transaction hash validation
const txHashSchema = Joi.string()
  .pattern(/^[0-9a-fA-F]{32,128}$/)
  .messages({
    "string.pattern.base": "Invalid transaction hash format",
  });

// Single ticket purchase validation schema
export const purchaseTicketSchema = Joi.object({
  lotterySlug: Joi.string().required().messages({
    "any.required": "Lottery slug is required",
  }),
  numbers: numbersArraySchema,
  txHash: txHashSchema.required().messages({
    "any.required": "Transaction hash is required",
  }),
  walletAddress: Joi.string().required().messages({
    "any.required": "Wallet address is required",
  }),
  price: Joi.number().positive().required().messages({
    "any.required": "Price is required",
    "number.positive": "Price must be positive",
  }),
  currency: Joi.string().valid("TON", "USDT").default("TON").messages({
    "any.only": "Currency must be either TON or USDT",
  }),
});

// Bulk ticket purchase validation schema
export const purchaseTicketsBulkSchema = Joi.object({
  tickets: Joi.array()
    .items(
      Joi.object({
        lotterySlug: Joi.string().required(),
        numbers: numbersArraySchema,
        txHash: txHashSchema.required(),
        walletAddress: Joi.string().required(),
        price: Joi.number().positive().required(),
        currency: Joi.string().valid("TON", "USDT").default("TON"),
      }),
    )
    .min(1)
    .max(10)
    .required()
    .messages({
      "array.min": "At least one ticket is required",
      "array.max": "Maximum 10 tickets per purchase",
      "any.required": "Tickets are required",
    }),
});

// Legacy buy ticket validation schema (for /api/lottery/buy-ticket)
export const buyTicketSchema = Joi.object({
  numbers: numbersArraySchema,
  transactionHash: txHashSchema.optional(),
  walletAddress: Joi.string().optional(),
  slug: Joi.string().optional(),
  currency: Joi.string().valid("TON", "USDT").default("TON"),
});

// Legacy buy tickets validation schema
export const buyTicketsSchema = Joi.object({
  tickets: Joi.array()
    .items(
      Joi.object({
        numbers: numbersArraySchema,
      }),
    )
    .min(1)
    .max(10)
    .required()
    .messages({
      "array.min": "At least one ticket is required",
      "array.max": "Maximum 10 tickets per purchase",
    }),
  transactionHash: txHashSchema.optional(),
  walletAddress: Joi.string().optional(),
  slug: Joi.string().optional(),
  currency: Joi.string().valid("TON", "USDT").default("TON"),
});

/**
 * Middleware factory for validating request body against a Joi schema
 */
export const validateRequest = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Return all errors, not just the first one
      stripUnknown: true, // Remove unknown fields
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      res.status(400).json({
        success: false,
        error: "Validation Error",
        message: "Invalid request data",
        errors,
      });
      return;
    }

    // Replace request body with validated and sanitized value
    req.body = value;
    next();
  };
};

/**
 * Middleware for validating single ticket purchase
 */
export const validatePurchaseTicket = validateRequest(purchaseTicketSchema);

/**
 * Middleware for validating bulk ticket purchase
 */
export const validatePurchaseTicketsBulk = validateRequest(
  purchaseTicketsBulkSchema,
);

/**
 * Middleware for validating buy ticket request
 */
export const validateBuyTicket = validateRequest(buyTicketSchema);

/**
 * Middleware for validating buy tickets (bulk) request
 */
export const validateBuyTickets = validateRequest(buyTicketsSchema);
