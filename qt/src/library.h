// Library (proof of concept): the media files of one folder, with a thumbnail and duration from FFmpeg (in the
// background, like v2.x does).
#pragma once
#include <QObject>
#include <QVariantList>
#include <QtQml/qqmlregistration.h>

class Library : public QObject {
  Q_OBJECT
  QML_ELEMENT
  Q_PROPERTY(QVariantList items READ items NOTIFY itemsChanged)
  Q_PROPERTY(QString folder READ folder NOTIFY itemsChanged)
public:
  explicit Library(QObject *parent = nullptr) : QObject(parent) {}
  QVariantList items() const { return m_items; }
  QString folder() const { return m_folder; }
  Q_INVOKABLE void scan(const QString &folder);
signals:
  void itemsChanged();
private:
  QVariantList m_items;
  QString m_folder;
};
