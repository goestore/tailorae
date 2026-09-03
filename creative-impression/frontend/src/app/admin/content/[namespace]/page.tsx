import type { Metadata } from 'next';
import { ContentEditor, ContentNamespaceNav } from '@/components/admin/ContentEditor';

interface PageProps {
  params: Promise<{ namespace: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { namespace } = await params;
  return {
    title: `${namespace} content | Admin`,
    // One URL per namespace, all of them internal tooling.
    robots: { index: false, follow: false },
  };
}

/**
 * The content editor, one namespace per URL.
 *
 * The segment is passed through as a string rather than resolved here: the
 * registry that maps it to a definition lives in the client module beside the
 * form, because a `ContentDefinition` carries `validate()` functions that
 * cannot cross the server/client boundary. An unknown segment is reported by
 * the editor, which can list the namespaces that do exist.
 */
export default async function ContentNamespacePage({ params }: PageProps) {
  const { namespace } = await params;

  return (
    <div className="admin-content flex flex-col gap-6">
      <header className="admin-page-header flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="admin-kicker">Content Studio</p>
          <h1 className="text-2xl font-bold tracking-tight text-[#1d1d1f]">Site Content</h1>
        </div>
        <p className="text-[13px] leading-relaxed text-[#86868b] max-w-2xl">
          Every value below is declared in a content schema. Editing one here changes only what is
          stored; the storefront falls back to the value it ships with until you publish.
        </p>
        <div className="pt-1">
          <ContentNamespaceNav current={namespace} />
        </div>
      </header>

      <ContentEditor namespace={namespace} />
    </div>
  );
}
