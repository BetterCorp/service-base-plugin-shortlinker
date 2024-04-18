import {z} from "zod";

export const ShortDomainSchema = z.object({
  id: z.string()
       .uuid(),
  name: z.string(),
  domain: z.string(),
  active: z.boolean(),
  canCreateDynamicLinks: z.boolean(),
  defaultRedirectTo: z.string()
                      .nullable(),
});
export type ShortDomain = z.infer<typeof ShortDomainSchema>;

export const ShortLinkSchema = z.object({
  name: z.string(),
  domainId: z.string()
             .uuid(),
  key: z.string(),
  redirectTo: z.string(),
  active: z.boolean(),
  activeFrom: z.number()
               .nullable(),
  activeTo: z.number()
             .nullable(),
});
export type ShortLink = z.infer<typeof ShortLinkSchema>;

export const ShortLinkLogSchema = z.object({
  domainId: z.string()
             .uuid(),
  linkId: z.string()
           .uuid(),
  ip: z.string(),
  userAgent: z.string(),
  referer: z.string(),
  timestamp: z.string(),
});
export type ShortLinkLog = z.infer<typeof ShortLinkLogSchema>;

export type ShortLinkPerson = {
  domain: ShortDomain,
  link: ShortLink | null
}