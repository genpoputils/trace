import { FileRecord } from '../types/trace';

export const SAMPLE_ECOMMERCE_API: Record<string, FileRecord> = {
  'src/server.ts': {
    path: 'src/server.ts',
    language: 'typescript',
    lines: 26,
    size: 780,
    content: `import express from 'express';
import { orderRouter } from './routes/orderRoutes';
import { authRouter } from './routes/authRoutes';
import { errorHandler } from './middleware/errorHandler';

const app = express();
app.use(express.json());

// Register API Routes
app.use('/api/orders', orderRouter);
app.use('/api/auth', authRouter);

// Global Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server listening on port \${PORT}\`);
});

export { app };
`,
  },

  'src/routes/orderRoutes.ts': {
    path: 'src/routes/orderRoutes.ts',
    language: 'typescript',
    lines: 24,
    size: 690,
    content: `import { Router } from 'express';
import { createOrderHandler, getOrderHandler } from '../controllers/orderController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

// Route: POST /api/orders
router.post('/', authenticateToken, createOrderHandler);

// Route: GET /api/orders/:id
router.get('/:id', authenticateToken, getOrderHandler);

export { router as orderRouter };
`,
  },

  'src/controllers/orderController.ts': {
    path: 'src/controllers/orderController.ts',
    language: 'typescript',
    lines: 38,
    size: 1150,
    content: `import { Request, Response } from 'express';
import { createOrder, getOrderById } from '../services/orderService';
import { validateOrderPayload } from '../utils/validators';

export async function createOrderHandler(req: Request, res: Response) {
  try {
    const { items, customerId, totalAmount } = req.body;
    validateOrderPayload(items, totalAmount);

    const order = await createOrder({
      customerId,
      items,
      totalAmount,
    });

    return res.status(201).json({ success: true, data: order });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
}

export async function getOrderHandler(req: Request, res: Response) {
  try {
    const orderId = req.params.id;
    const order = await getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    return res.json({ success: true, data: order });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
`,
  },

  'src/services/orderService.ts': {
    path: 'src/services/orderService.ts',
    language: 'typescript',
    lines: 42,
    size: 1320,
    content: `import { prisma } from '../db/prisma';
import { processPayment } from './paymentService';
import { sendNotification } from './notificationService';
import { calculateTax } from '../utils/taxCalculator';

export interface OrderInput {
  customerId: string;
  items: { productId: string; quantity: number; price: number }[];
  totalAmount: number;
}

export async function createOrder(input: OrderInput) {
  const tax = calculateTax(input.totalAmount);
  const finalAmount = input.totalAmount + tax;

  // Process payment via Stripe
  const paymentReceipt = await processPayment(input.customerId, finalAmount);

  // Persist order in database via Prisma
  const savedOrder = await prisma.order.create({
    data: {
      customerId: input.customerId,
      amount: finalAmount,
      status: 'CONFIRMED',
      transactionId: paymentReceipt.id,
    },
  });

  // Send asynchronous notification
  await sendNotification(input.customerId, \`Order #\${savedOrder.id} created\`);

  return savedOrder;
}

export async function getOrderById(orderId: string) {
  return await prisma.order.findUnique({
    where: { id: orderId },
  });
}
`,
  },

  'src/services/paymentService.ts': {
    path: 'src/services/paymentService.ts',
    language: 'typescript',
    lines: 20,
    size: 610,
    content: `import { stripeClient } from './stripeClient';

export async function processPayment(customerId: string, amount: number) {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }

  const result = await stripeClient.charges.create({
    amount: Math.round(amount * 100),
    currency: 'usd',
    customer: customerId,
  });

  return { id: result.id, status: 'succeeded' };
}
`,
  },

  'src/services/stripeClient.ts': {
    path: 'src/services/stripeClient.ts',
    language: 'typescript',
    lines: 15,
    size: 450,
    content: `export const stripeClient = {
  charges: {
    create: async (params: { amount: number; currency: string; customer: string }) => {
      return { id: \`ch_\${Date.now()}\`, ...params };
    },
  },
};
`,
  },

  'src/services/notificationService.ts': {
    path: 'src/services/notificationService.ts',
    language: 'typescript',
    lines: 18,
    size: 520,
    content: `export async function sendNotification(userId: string, message: string) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  console.log(\`Sending notification to \${userId}: \${message}\`);
  return { dispatched: true, timestamp: Date.now() };
}
`,
  },

  'src/db/prisma.ts': {
    path: 'src/db/prisma.ts',
    language: 'typescript',
    lines: 20,
    size: 580,
    content: `export const prisma = {
  order: {
    create: async (args: any) => ({ id: 'ord_123', ...args.data }),
    findUnique: async (args: any) => ({ id: args.where.id, amount: 99.99, status: 'CONFIRMED' }),
  },
  user: {
    findUnique: async (args: any) => ({ id: args.where.id, name: 'Alice' }),
  },
};
`,
  },

  'src/utils/taxCalculator.ts': {
    path: 'src/utils/taxCalculator.ts',
    language: 'typescript',
    lines: 12,
    size: 340,
    content: `export function calculateTax(amount: number): number {
  const defaultRate = 0.0825; // 8.25% state tax
  return Math.round(amount * defaultRate * 100) / 100;
}
`,
  },

  'src/utils/validators.ts': {
    path: 'src/utils/validators.ts',
    language: 'typescript',
    lines: 15,
    size: 420,
    content: `export function validateOrderPayload(items: any[], totalAmount: number): boolean {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Order must contain at least one item');
  }
  if (typeof totalAmount !== 'number' || totalAmount <= 0) {
    throw new Error('Invalid total amount');
  }
  return true;
}
`,
  },

  'src/middleware/authMiddleware.ts': {
    path: 'src/middleware/authMiddleware.ts',
    language: 'typescript',
    lines: 22,
    size: 640,
    content: `import { Request, Response, NextFunction } from 'express';
import { verifyJwtToken } from '../utils/jwt';

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const user = verifyJwtToken(token);
  (req as any).user = user;
  next();
}
`,
  },

  'src/utils/jwt.ts': {
    path: 'src/utils/jwt.ts',
    language: 'typescript',
    lines: 16,
    size: 490,
    content: `export function verifyJwtToken(token: string) {
  const secret = process.env.JWT_SECRET || 'dev-secret';
  if (token === 'invalid') {
    throw new Error('Invalid authentication token');
  }
  return { userId: 'usr_456', role: 'customer' };
}
`,
  },

  'src/components/OrderSummaryCard.tsx': {
    path: 'src/components/OrderSummaryCard.tsx',
    language: 'tsx',
    lines: 28,
    size: 790,
    content: `import React from 'react';
import { useOrderTrace } from '../hooks/useOrderTrace';

export interface OrderCardProps {
  orderId: string;
  total: number;
  onRefresh?: () => void;
}

export function OrderSummaryCard({ orderId, total, onRefresh }: OrderCardProps) {
  const { orderStatus, isLoading } = useOrderTrace(orderId);

  return (
    <div className="order-summary-card">
      <h3>Order #{orderId}</h3>
      <p>Total: \${total.toFixed(2)}</p>
      <span>Status: {isLoading ? 'Checking...' : orderStatus}</span>
      {onRefresh && <button onClick={onRefresh}>Refresh Status</button>}
    </div>
  );
}
`,
  },

  'src/hooks/useOrderTrace.ts': {
    path: 'src/hooks/useOrderTrace.ts',
    language: 'typescript',
    lines: 24,
    size: 680,
    content: `import { useState, useEffect } from 'react';
import { getOrderById } from '../services/orderService';

export function useOrderTrace(orderId: string) {
  const [orderStatus, setOrderStatus] = useState<string>('PENDING');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchStatus() {
      setIsLoading(true);
      const order = await getOrderById(orderId);
      if (order) {
        setOrderStatus(order.status || 'CONFIRMED');
      }
      setIsLoading(false);
    }
    fetchStatus();
  }, [orderId]);

  return { orderStatus, isLoading };
}
`,
  },

  'tests/order.test.ts': {
    path: 'tests/order.test.ts',
    language: 'typescript',
    lines: 25,
    size: 720,
    content: `import { createOrder } from '../src/services/orderService';
import { calculateTax } from '../src/utils/taxCalculator';

describe('Order Service Tests', () => {
  it('should calculate correct tax', () => {
    const tax = calculateTax(100);
    expect(tax).toBe(8.25);
  });

  it('should create order and process payment', async () => {
    const result = await createOrder({
      customerId: 'cust_99',
      items: [{ productId: 'p1', quantity: 1, price: 50 }],
      totalAmount: 50,
    });
    expect(result.status).toBe('CONFIRMED');
  });
});
`,
  },
};
