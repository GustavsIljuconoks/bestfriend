import { useCallback, useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { FolderOpen, UploadSimple, WarningCircle } from '@phosphor-icons/react'
import type { JobEvent, JobProgress, IndexingEstimate } from '@bestfriend/core'
import {
  useDocuments,
  useCollections,
  useDropFiles,
  useEstimateFiles,
  useRemoveDocument,
  useReindexDocument,
  useCreateCollection,
  useRenameCollection,
  useDeleteCollection,
  usePickFolder,
  useAddFolderIndex,
  useScanFolder,
} from '@renderer/state/queries/library'
import { DocumentRow } from '@renderer/components/library/DocumentRow'
import { CollectionsSidebar } from '@renderer/components/library/CollectionsSidebar'
import { CostEstimateDialog } from '@renderer/components/library/CostEstimateDialog'
import { JobProgressBar } from '@renderer/components/library/JobProgressBar'
import { useQueryClient } from '@tanstack/react-query'
import { DOCUMENTS_QUERY_KEY } from '@renderer/state/queries/library'

interface ActiveJob {
  jobId: string
  progress: JobProgress | null
  done: boolean
  error: string | null
}

export function Library() {
  const queryClient = useQueryClient()
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)
  const [pendingPaths, setPendingPaths] = useState<string[] | null>(null)
  const [estimate, setEstimate] = useState<IndexingEstimate | null>(null)
  const [activeJobs, setActiveJobs] = useState<Map<string, ActiveJob>>(new Map())
  const [reindexingIds, setReindexingIds] = useState<Set<string>>(new Set())
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())

  const { data: documents = [], isLoading: docsLoading } = useDocuments()
  const { data: collections = [] } = useCollections()

  const dropFiles = useDropFiles()
  const estimateFiles = useEstimateFiles()
  const removeDoc = useRemoveDocument()
  const reindexDoc = useReindexDocument()
  const createCollection = useCreateCollection()
  const renameCollection = useRenameCollection()
  const deleteCollection = useDeleteCollection()
  const pickFolder = usePickFolder()
  const addFolderIndex = useAddFolderIndex()
  const scanFolder = useScanFolder()

  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    unsubRef.current = window.api.onJobEvent((event: JobEvent) => {
      setActiveJobs((prev) => {
        const next = new Map(prev)
        const existing = next.get(event.job_id) ?? {
          jobId: event.job_id,
          progress: null,
          done: false,
          error: null,
        }
        if (event.type === 'progress') {
          const firstProgress = !existing.progress && Boolean(event.progress)
          next.set(event.job_id, { ...existing, progress: event.progress ?? null })
          if (firstProgress) {
            void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
          }
        } else if (event.type === 'complete') {
          next.set(event.job_id, { ...existing, done: true })
          void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
          setTimeout(() => {
            setActiveJobs((p) => {
              const m = new Map(p)
              m.delete(event.job_id)
              return m
            })
          }, 3000)
        } else if (event.type === 'error') {
          next.set(event.job_id, { ...existing, done: true, error: event.error ?? 'Unknown error' })
          void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
          setTimeout(() => {
            setActiveJobs((p) => {
              const m = new Map(p)
              m.delete(event.job_id)
              return m
            })
          }, 8000)
        }
        return next
      })
    })
    return () => unsubRef.current?.()
  }, [queryClient])

  const handleFilesDropped = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return
      try {
        const est = await estimateFiles.mutateAsync(paths)
        if (est.exceeds_threshold) {
          setEstimate(est)
          setPendingPaths(paths)
        } else {
          const { jobId } = await dropFiles.mutateAsync(paths)
          setActiveJobs((prev) => {
            const next = new Map(prev)
            next.set(jobId, { jobId, progress: null, done: false, error: null })
            return next
          })
        }
      } catch (err) {
        console.error('Failed to estimate files:', err)
        const { jobId } = await dropFiles.mutateAsync(paths)
        setActiveJobs((prev) => {
          const next = new Map(prev)
          next.set(jobId, { jobId, progress: null, done: false, error: null })
          return next
        })
      }
    },
    [estimateFiles, dropFiles],
  )

  const handleConfirmEstimate = useCallback(async () => {
    if (!pendingPaths) return
    setEstimate(null)
    const paths = pendingPaths
    setPendingPaths(null)
    const { jobId } = await dropFiles.mutateAsync(paths)
    setActiveJobs((prev) => {
      const next = new Map(prev)
      next.set(jobId, { jobId, progress: null, done: false, error: null })
      return next
    })
  }, [pendingPaths, dropFiles])

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const paths = window.api.getPathsForDroppedFiles(acceptedFiles)
      if (paths.length === 0 && acceptedFiles.length > 0) {
        console.warn(
          '[library] Could not resolve file paths for dropped selection; drag from Finder or use Add Files.',
        )
      }
      if (paths.length > 0) void handleFilesDropped(paths)
    },
    [handleFilesDropped],
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  })

  const handleAddFolder = useCallback(async () => {
    const folderPath = await pickFolder.mutateAsync()
    if (!folderPath) return
    const { indexId } = await addFolderIndex.mutateAsync(folderPath)
    const { jobId } = await scanFolder.mutateAsync(indexId)
    setActiveJobs((prev) => {
      const next = new Map(prev)
      next.set(jobId, { jobId, progress: null, done: false, error: null })
      return next
    })
  }, [pickFolder, addFolderIndex, scanFolder])

  const handleRemove = useCallback(
    (id: string) => {
      setRemovingIds((s) => new Set(s).add(id))
      removeDoc.mutate(id, {
        onSettled: () => setRemovingIds((s) => { const n = new Set(s); n.delete(id); return n }),
      })
    },
    [removeDoc],
  )

  const handleReindex = useCallback(
    (id: string) => {
      setReindexingIds((s) => new Set(s).add(id))
      reindexDoc.mutate(id, {
        onSuccess: ({ jobId }) => {
          setActiveJobs((prev) => {
            const next = new Map(prev)
            next.set(jobId, { jobId, progress: null, done: false, error: null })
            return next
          })
        },
        onSettled: () =>
          setReindexingIds((s) => { const n = new Set(s); n.delete(id); return n }),
      })
    },
    [reindexDoc],
  )

  const filteredDocs = documents

  const jobs = Array.from(activeJobs.values())

  return (
    <div className="library-layout" {...getRootProps()}>
      <input {...getInputProps()} />

      <CollectionsSidebar
        collections={collections}
        selectedId={selectedCollectionId}
        onSelect={setSelectedCollectionId}
        onCreate={(name) => createCollection.mutate({ name })}
        onRename={(id, name) => renameCollection.mutate({ id, name })}
        onDelete={(id) => deleteCollection.mutate(id)}
      />

      <div className="library-main">
        <div className="library-toolbar">
          <h1 className="library-title">Library</h1>
          <div className="library-toolbar-actions">
            <button className="btn btn-ghost btn-sm" onClick={open}>
              <UploadSimple size={14} />
              Add Files
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => void handleAddFolder()}
              disabled={pickFolder.isPending || addFolderIndex.isPending || scanFolder.isPending}
            >
              <FolderOpen size={14} />
              Add Folder
            </button>
          </div>
        </div>

        {jobs.map((job) => (
          <div key={job.jobId} className="job-banner">
            {job.error ? (
              <div className="job-banner-error">
                <WarningCircle size={14} />
                <span>{job.error}</span>
              </div>
            ) : job.done ? (
              <div className="job-banner-done">Indexing complete</div>
            ) : (
              job.progress && <JobProgressBar progress={job.progress} />
            )}
          </div>
        ))}

        {isDragActive && (
          <div className="library-drop-overlay">
            <UploadSimple size={40} weight="thin" />
            <p>Drop files to index</p>
          </div>
        )}

        {docsLoading ? (
          <div className="library-loading">Loading documents…</div>
        ) : filteredDocs.length === 0 ? (
          <div className="library-empty">
            <UploadSimple size={48} weight="thin" />
            <h2>No documents yet</h2>
            <p>Drag and drop files here, or use the buttons above to add files or a folder.</p>
            <div className="library-empty-actions">
              <button className="btn btn-primary" onClick={open}>
                Add Files
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => void handleAddFolder()}
                disabled={pickFolder.isPending}
              >
                Add Folder
              </button>
            </div>
          </div>
        ) : (
          <div className="doc-list">
            {filteredDocs.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onReindex={handleReindex}
                onRemove={handleRemove}
                isReindexing={reindexingIds.has(doc.id)}
                isRemoving={removingIds.has(doc.id)}
              />
            ))}
          </div>
        )}
      </div>

      {estimate && pendingPaths && (
        <CostEstimateDialog
          estimate={estimate}
          onConfirm={() => void handleConfirmEstimate()}
          onCancel={() => {
            setEstimate(null)
            setPendingPaths(null)
          }}
        />
      )}

    </div>
  )
}
