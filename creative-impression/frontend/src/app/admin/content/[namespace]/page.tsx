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
    <div className="admin-content">
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Site Content</h1>
          <p className="admin-page-sub">
            Every value below is declared in a content schema. Editing one here changes only what is
            stored; the storefront falls back to the value it ships with until you publish.
          </p>
        </div>
      </header>
      <ContentNamespaceNav current={namespace} />

      <ContentEditor namespace={namespace} />
    </div>
  );
}
