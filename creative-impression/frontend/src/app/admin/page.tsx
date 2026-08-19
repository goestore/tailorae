'use client';

import { useState } from 'react';
import { Button, Card } from '@/components/common';
import { Product } from '@/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import axios from 'axios';

export default function StorefrontManagement() {
  const [activeTab, setActiveTab] = useState<'BANNERS' | 'PRODUCTS'>('BANNERS');
  const queryClient = useQueryClient();
  const token = useSelector((state: any) => state.auth?.token);

  const axiosConfig = {
    headers: { Authorization: `Bearer ${token}` }
  };

  const { data: banners = [], isLoading: bannersLoading } = useQuery({
    queryKey: ['adminBanners'],
    queryFn: async () => {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/admin/banners`, axiosConfig);
      return res.data.data.banners;
    }
  });

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['adminProducts'],
    queryFn: async () => {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/admin/products`, axiosConfig);
      return res.data.data.products;
    }
  });

  const toggleFeaturedMutation = useMutation({
    mutationFn: async ({ id, isFeatured }: { id: string, isFeatured: boolean }) => {
      const res = await axios.patch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/admin/products/${id}/featured`, { isFeatured }, axiosConfig);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminProducts'] });
    }
  });

  const deleteBannerMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await axios.delete(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/admin/banners/${id}`, axiosConfig);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminBanners'] });
    }
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold font-serif text-neutral-900 dark:text-white">Storefront Management</h1>
          <p className="text-neutral-500 mt-2">Manage your homepage banners and featured product cards.</p>
        </div>
        {activeTab === 'BANNERS' && (
          <Button>+ Add New Banner</Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 border-b border-neutral-200 dark:border-neutral-700 mb-6">
        <button
          className={`pb-4 px-2 font-medium transition-colors ${
            activeTab === 'BANNERS' 
            ? 'text-primary-600 border-b-2 border-primary-600' 
            : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
          }`}
          onClick={() => setActiveTab('BANNERS')}
        >
          Banners Management
        </button>
        <button
          className={`pb-4 px-2 font-medium transition-colors ${
            activeTab === 'PRODUCTS' 
            ? 'text-primary-600 border-b-2 border-primary-600' 
            : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
          }`}
          onClick={() => setActiveTab('PRODUCTS')}
        >
          Featured Products
        </button>
      </div>

      {/* Banners Tab */}
      {activeTab === 'BANNERS' && (
        <div className="space-y-6">
          {bannersLoading && <p className="text-neutral-500">Loading banners...</p>}
          {!bannersLoading && banners.length === 0 && (
            <p className="text-neutral-500">No banners found. Add a new banner to get started.</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {banners.map((banner: any) => (
            <Card key={banner.id} className="overflow-hidden flex flex-col">
              <img 
                src={banner.image} 
                alt={banner.title} 
                className={`h-48 w-full object-cover ${!banner.isActive && 'grayscale opacity-60'}`} 
              />
              <div className="p-4 flex flex-col flex-1">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-lg">{banner.title}</h3>
                    <span className="text-xs bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded text-neutral-600 dark:text-neutral-400">
                      {banner.position}
                    </span>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${banner.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {banner.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                
                <div className="mt-auto flex gap-2 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                  <Button variant="outline" className="flex-1">Edit</Button>
                  <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => deleteBannerMutation.mutate(banner.id)}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
          </div>
        </div>
      )}

      {/* Featured Products Tab */}
      {activeTab === 'PRODUCTS' && (
        <>
        {productsLoading ? (
          <p className="text-neutral-500">Loading products...</p>
        ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
                  <th className="p-4 font-semibold text-sm">Product Name</th>
                  <th className="p-4 font-semibold text-sm">Price</th>
                  <th className="p-4 font-semibold text-sm">Status</th>
                  <th className="p-4 font-semibold text-sm text-center">Featured on Storefront</th>
                  <th className="p-4 font-semibold text-sm text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {products.map((product: any) => (
                  <tr key={product.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                    <td className="p-4">
                      <span className="font-medium">{product.name}</span>
                    </td>
                    <td className="p-4">₹{product.price}</td>
                    <td className="p-4">
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                        {product.status}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          defaultChecked={product.isFeatured}
                        onChange={(e) => toggleFeaturedMutation.mutate({ id: product.id, isFeatured: e.target.checked })}
                        />
                        <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-primary-600"></div>
                      </label>
                    </td>
                    <td className="p-4 text-right">
                      <Button variant="outline" size="sm">View</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        )}
        </>
      )}
    </div>
  );
}