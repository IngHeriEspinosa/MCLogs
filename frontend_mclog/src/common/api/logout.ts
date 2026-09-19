import client from "@/common/api/client";

export const logoutClient = async () => {
  await client.post("/auth/logout", {});
};
