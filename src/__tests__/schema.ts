import { Order } from "./order";
import { Product } from "./product";

export interface PostData {
  stamp: Date;
  order: Order;
  products: Product[];
}
