"use server";

import { getBlueRate, type BlueRate } from "@/lib/blue";

export async function fetchBlueRate(): Promise<BlueRate> {
  return getBlueRate();
}
