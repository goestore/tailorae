'use client';

import React from 'react';
import { Card } from '@/components/common';

export interface Order {
  id: string;
  date: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  total: number;
  itemCount: number;
}

export interface OrderHistoryProps {
  orders: Order[];
  onOrderClick?: (orderId: string) => void;
}

const statusColors: Record<Order['status'], string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export const OrderHistory: React.FC<OrderHistoryProps> = ({
  orders,
  onOrderClick,
}) => {
  if (orders.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">No orders found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <Card
          key={order.id}
          className="p-4 hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => onOrderClick?.(order.id)}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">Order #{order.id}</p>
              <p className="text-sm text-gray-500">{order.date}</p>
              <p className="text-sm text-gray-600">{order.itemCount} items</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-primary-600">₹{order.total}</p>
              <span
                className={`inline-block px-3 py-1 rounded-full text-sm font-medium mt-2 ${
                  statusColors[order.status]
                }`}
              >
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};
