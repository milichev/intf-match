export interface Order {
  _id: string;
  items: LineItem[];
  buyer: string;
}

export interface LineItem {
  product_id: string;
  quantity: number;
}
