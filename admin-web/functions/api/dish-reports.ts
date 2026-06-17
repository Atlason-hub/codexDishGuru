import { fetchSupabaseJson, json, type Env, type PagesFunction } from "../_lib/cloudflare";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const reports = await fetchSupabaseJson<
      Array<{
        id: string;
        dish_association_id: string;
        reported_by_user_id: string;
        reason: string;
        details?: string | null;
        status: string;
        created_at?: string | null;
      }>
    >(env, "dish_reports?select=*&order=created_at.desc");

    const dishIds = Array.from(new Set(reports.map((report) => report.dish_association_id).filter(Boolean)));
    const reporterIds = Array.from(new Set(reports.map((report) => report.reported_by_user_id).filter(Boolean)));

    const dishes = dishIds.length
      ? await fetchSupabaseJson<
          Array<{
            id: string;
            user_id?: string | null;
            dish_name?: string | null;
            restaurant_name?: string | null;
            image_url?: string | null;
            image_path?: string | null;
            created_at?: string | null;
          }>
        >(
          env,
          `dish_associations?select=id,user_id,dish_name,restaurant_name,image_url,image_path,created_at&id=in.(${dishIds
            .map(encodeURIComponent)
            .join(",")})`
        )
      : [];

    const uploaderIds = Array.from(new Set(dishes.map((dish) => dish.user_id).filter(Boolean))) as string[];

    const reporters = reporterIds.length
      ? await fetchSupabaseJson<Array<{ user_id: string; email?: string | null }>>(
          env,
          `AppUsers?select=user_id,email&user_id=in.(${reporterIds.map(encodeURIComponent).join(",")})`
        )
      : [];

    const uploaders = uploaderIds.length
      ? await fetchSupabaseJson<Array<{ user_id: string; email?: string | null }>>(
          env,
          `AppUsers?select=user_id,email&user_id=in.(${uploaderIds.map(encodeURIComponent).join(",")})`
        )
      : [];

    const dishesById = new Map(dishes.map((dish) => [dish.id, dish]));
    const reportersById = new Map(reporters.map((reporter) => [reporter.user_id, reporter]));
    const uploadersById = new Map(uploaders.map((uploader) => [uploader.user_id, uploader]));

    return json(
      reports.map((report) => {
        const dish = dishesById.get(report.dish_association_id);
        const reporter = reportersById.get(report.reported_by_user_id);
        const uploader = dish?.user_id ? uploadersById.get(dish.user_id) : null;

        return {
          id: report.id,
          dishAssociationId: report.dish_association_id,
          reportedByUserId: report.reported_by_user_id,
          reporterEmail: reporter?.email ?? report.reported_by_user_id,
          uploadedByUserId: dish?.user_id ?? null,
          uploadedByEmail: uploader?.email ?? dish?.user_id ?? null,
          reason: report.reason,
          details: report.details ?? null,
          status: report.status,
          createdAt: report.created_at ?? null,
          dishName: dish?.dish_name ?? null,
          restaurantName: dish?.restaurant_name ?? null,
          imageUrl: dish?.image_url ?? null,
          imagePath: dish?.image_path ?? null,
          dishCreatedAt: dish?.created_at ?? null
        };
      })
    );
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Failed to load dish reports" },
      { status: 500 }
    );
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, request }) => {
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return json({ error: "Missing report id" }, { status: 400 });
  }

  try {
    await fetchSupabaseJson<unknown>(env, `dish_reports?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    return json({ ok: true });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Failed to delete dish report" },
      { status: 500 }
    );
  }
};
