import type { BlockServiceOptions, BlockSpec } from '@blocksuite/block-std';
import type { ParagraphService } from '@blocksuite/blocks';
import {
  AttachmentService,
  DocEditorBlockSpecs,
  EdgelessEditorBlockSpecs,
  PageService,
} from '@blocksuite/blocks';
import bytes from 'bytes';
import { html, unsafeStatic } from 'lit/static-html.js';
import ReactDOMServer from 'react-dom/server';

class CustomAttachmentService extends AttachmentService {
  override mounted(): void {
    // blocksuite default max file size is 10MB, we override it to 2GB
    // but the real place to limit blob size is CloudQuotaModal / LocalQuotaModal
    this.maxFileSize = bytes.parse('2GB');
  }
}

class CustomPageService extends PageService {
  constructor(opt: BlockServiceOptions) {
    super(opt);
    const officialDomains = new Set(['affine.pro', 'affine.fail']);
    const load = this.fontLoader.load.bind(this.fontLoader);
    this.fontLoader.load = function (fonts) {
      if (!officialDomains.has(window.location.host)) {
        return load(
          fonts.map(f => ({
            ...f,
            // self-hosted fonts are served from /assets
            url: '/assets' + new URL(f.url).pathname.split('/').pop(),
          }))
        );
      }
      return load(fonts);
    };
  }
}

type AffineReference = HTMLElementTagNameMap['affine-reference'];
type PageReferenceRenderer = (reference: AffineReference) => React.ReactElement;

export interface InlineRenderers {
  pageReference?: PageReferenceRenderer;
}

function patchSpecsWithReferenceRenderer(
  specs: BlockSpec<string>[],
  pageReferenceRenderer: PageReferenceRenderer
) {
  const renderer = (reference: AffineReference) => {
    const node = pageReferenceRenderer(reference);
    const inner = ReactDOMServer.renderToString(node);
    return html`${unsafeStatic(inner)}`;
  };
  return specs.map(spec => {
    if (
      ['affine:paragraph', 'affine:list', 'affine:database'].includes(
        spec.schema.model.flavour
      )
    ) {
      // todo: remove these type assertions
      spec.service = class extends (spec.service as typeof ParagraphService) {
        override mounted() {
          super.mounted();
          this.referenceNodeConfig.setCustomContent(renderer);
        }
      };
    }

    return spec;
  });
}

/**
 * Patch the block specs with custom renderers.
 */
export function patchSpecs(
  specs: BlockSpec<string>[],
  inlineRenderers?: InlineRenderers
) {
  let newSpecs = specs;
  if (inlineRenderers?.pageReference) {
    newSpecs = patchSpecsWithReferenceRenderer(
      newSpecs,
      inlineRenderers.pageReference
    );
  }
  return newSpecs;
}

export const docModeSpecs = DocEditorBlockSpecs.map(spec => {
  if (spec.schema.model.flavour === 'affine:attachment') {
    return {
      ...spec,
      service: CustomAttachmentService,
    };
  }
  if (spec.schema.model.flavour === 'affine:page') {
    return {
      ...spec,
      service: CustomPageService,
    };
  }
  return spec;
});
export const edgelessModeSpecs = EdgelessEditorBlockSpecs.map(spec => {
  if (spec.schema.model.flavour === 'affine:attachment') {
    return {
      ...spec,
      service: CustomAttachmentService,
    };
  }
  return spec;
});